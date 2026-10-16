/**
 * Loads a packed LDraw model and builds it on screen in its real instruction
 * order: each building step's parts drop in from above and settle into place.
 * Imported on demand, so three.js only downloads when the LEGO section is near.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  Object3D,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LDrawLoader } from 'three/examples/jsm/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/examples/jsm/materials/LDrawConditionalLineMaterial.js';
import { buildSchedule, dropOffset, type Scheduled } from '~/lib/buildSchedule';

export interface BuildCallbacks {
  onProgress?: (step: number, steps: number) => void;
  onDone?: () => void;
}

interface Unit extends Scheduled {
  object: Object3D;
  rest: Vector3;
  lift: Vector3;
}

const DROP_MS = 520;

async function fetchModel(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Some servers decode the gzip for us; only inflate when the magic bytes are still there.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return new TextDecoder().decode(bytes);
}

function parseModel(text: string): Promise<Group> {
  const loader = new LDrawLoader();
  loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
  loader.smoothNormals = true;
  loader.addDefaultMaterials();
  return new Promise((resolve, reject) => loader.parse(text, resolve, reject));
}

/** The pieces to animate: the highest groups that hold geometry themselves. */
function collectUnits(root: Object3D): Object3D[] {
  const units: Object3D[] = [];
  const visit = (node: Object3D) => {
    const holdsGeometry = node.children.some((child) => (child as Mesh).isMesh || child.type === 'LineSegments');
    if (node !== root && holdsGeometry) {
      units.push(node);
      return;
    }
    node.children.forEach(visit);
  };
  visit(root);
  return units;
}

function dispose(root: Object3D) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

export class LegoBuild {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(35, 1, 1, 100000);
  readonly #controls: OrbitControls;
  readonly #resize: ResizeObserver;
  readonly #reducedMotion: boolean;
  #model: Group | null = null;
  #units: Unit[] = [];
  #start = 0;
  #lastStep = -1;
  #totalSteps = 0;
  #building = false;
  #visible = true;
  #frame = 0;
  #callbacks: BuildCallbacks = {};
  #token = 0;

  constructor(
    private readonly container: HTMLElement,
    options: { reducedMotion: boolean; interactive: boolean },
  ) {
    this.#reducedMotion = options.reducedMotion;
    this.#renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.toneMappingExposure = 1.05;
    container.append(this.#renderer.domElement);

    this.#scene.add(new HemisphereLight(0xffffff, 0x5a5048, 2.2));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(1, 2, 1.4);
    const fill = new DirectionalLight(0xffffff, 0.9);
    fill.position.set(-1.5, 0.6, -1);
    this.#scene.add(key, fill);

    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.enablePan = false;
    // The wheel belongs to the page; zooming here would trap scrolling.
    this.#controls.enableZoom = false;
    this.#controls.enabled = options.interactive;
    this.#controls.autoRotateSpeed = 1.1;

    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(container);
    this.#fit();
    this.#loop();
  }

  /** Pause rendering while the viewer is scrolled out of sight. */
  setVisible(visible: boolean) {
    this.#visible = visible;
    if (visible) this.#loop();
  }

  async show(url: string, callbacks: BuildCallbacks = {}) {
    const token = ++this.#token;
    this.#callbacks = callbacks;
    const model = await parseModel(await fetchModel(url));
    if (token !== this.#token) {
      dispose(model);
      return;
    }
    if (this.#model) {
      this.#scene.remove(this.#model);
      dispose(this.#model);
    }

    // LDraw's y axis points down.
    model.rotation.x = Math.PI;
    this.#scene.add(model);
    model.updateMatrixWorld(true);
    this.#model = model;
    this.#frameCamera(model);

    const objects = collectUnits(model);
    const height = new Box3().setFromObject(model).getSize(new Vector3()).y;
    const schedule = buildSchedule(
      objects.map((object) => (object.userData['buildingStep'] as number | undefined) ?? 0),
      { dropMs: DROP_MS },
    );
    this.#units = objects.map((object, index) => {
      const lift = dropOffset(object, height * 0.75);
      return { ...schedule.items[index]!, object, rest: object.position.clone(), lift };
    });
    this.#totalSteps = schedule.steps;
    this.build();
  }

  /** Start the build from an empty baseplate. */
  build() {
    if (!this.#model) return;
    this.#controls.autoRotate = false;
    this.#lastStep = -1;
    if (this.#reducedMotion) {
      for (const unit of this.#units) {
        unit.object.visible = true;
        unit.object.position.copy(unit.rest);
      }
      this.#callbacks.onProgress?.(this.#totalSteps, this.#totalSteps);
      this.#finish();
      return;
    }
    for (const unit of this.#units) unit.object.visible = false;
    this.#building = true;
    this.#start = performance.now();
    this.#loop();
  }

  destroy() {
    cancelAnimationFrame(this.#frame);
    this.#resize.disconnect();
    this.#controls.dispose();
    if (this.#model) dispose(this.#model);
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  #finish() {
    this.#building = false;
    this.#controls.autoRotate = true;
    this.#callbacks.onDone?.();
  }

  #fit() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  #frameCamera(model: Object3D) {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const radius = size.length() / 2;
    const fov = (this.#camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 0.78;
    // A three-quarter view from the front and slightly above.
    const direction = new Vector3(0.9, 0.48, -1).normalize();
    this.#camera.position.copy(center).addScaledVector(direction, distance);
    this.#camera.near = distance / 100;
    this.#camera.far = distance * 10;
    this.#camera.updateProjectionMatrix();
    this.#controls.target.copy(center);
    this.#controls.update();
  }

  #loop = () => {
    cancelAnimationFrame(this.#frame);
    if (!this.#visible || document.hidden) return;
    if (this.#building) this.#tick(performance.now() - this.#start);
    this.#controls.update();
    this.#renderer.render(this.#scene, this.#camera);
    this.#frame = requestAnimationFrame(this.#loop);
  };

  #tick(elapsed: number) {
    let done = true;
    let step = 0;
    for (const unit of this.#units) {
      const t = (elapsed - unit.startMs) / DROP_MS;
      if (t <= 0) {
        unit.object.visible = false;
        done = false;
        continue;
      }
      unit.object.visible = true;
      step = Math.max(step, unit.step);
      // Ease out with a small settle, like a brick clicking onto studs.
      const k = t >= 1 ? 1 : 1 - (1 - t) ** 3;
      if (t < 1) done = false;
      unit.object.position.copy(unit.rest).addScaledVector(unit.lift, 1 - k);
    }
    if (step !== this.#lastStep) {
      this.#lastStep = step;
      this.#callbacks.onProgress?.(step + 1, this.#totalSteps);
    }
    if (done) this.#finish();
  }
}
