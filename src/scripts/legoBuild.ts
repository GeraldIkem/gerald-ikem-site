/**
 * Loads a packed LDraw model and builds it on screen in its real instruction
 * order: each building step's parts drop in from above and settle into place.
 * A scan of a finished build has no steps, so it rises into view from its base.
 * Imported on demand, so three.js only downloads when the LEGO section is near.
 */
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type MeshStandardMaterial,
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

// How long one piece takes to drop into place, roughly how long a whole build runs, and how long a scan takes to rise.
const DROP_MS = 360;
const BUILD_MS = 6_000;
const RISE_MS = 2600;

/** Download a packed model; start it early and pass the result to `show` to overlap it with loading three.js. */
export async function downloadModel(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.arrayBuffer();
}

async function fetchModel(download: Promise<ArrayBuffer>): Promise<string> {
  const bytes = new Uint8Array(await download);
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
  // Smoothing normals across parts roughly quadrupled the parse time (seconds of a frozen page)
  // for a difference that's hard to see at this size.
  loader.smoothNormals = false;
  loader.addDefaultMaterials();
  return new Promise((resolve, reject) => loader.parse(text, resolve, reject));
}

/** A binary glTF scan. Its loaders only download when a scan is shown. */
async function parseScan(url: string): Promise<Object3D> {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  return gltf.scene;
}

/**
 * A photo scan already carries the real light in its texture, so it's drawn
 * as photographed, without the scene's lights or tone mapping on top.
 */
function drawAsPhotographed(root: Object3D, clip: Plane[]) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const vertexColors = Boolean(mesh.geometry.getAttribute('color'));
    const swap = (old: Material) => {
      const { map = null, color } = old as MeshStandardMaterial;
      old.dispose();
      return new MeshBasicMaterial({
        map,
        color: map ? 0xffffff : color,
        vertexColors,
        side: DoubleSide,
        toneMapped: false,
        clippingPlanes: clip,
      });
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
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
    for (const m of [material ?? []].flat()) {
      (m as MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  });
}

export class LegoBuild {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(35, 1, 1, 100000);
  readonly #controls: OrbitControls;
  readonly #resize: ResizeObserver;
  readonly #reducedMotion: boolean;
  #model: Object3D | null = null;
  #units: Unit[] = [];
  /** For a scan: the plane that hides everything above the rising line, and how far it rises. */
  #rise: { plane: Plane; from: number; to: number } | null = null;
  #start = 0;
  #lastStep = -1;
  #totalSteps = 0;
  #building = false;
  #visible = true;
  #frame = 0;
  #callbacks: BuildCallbacks = {};
  #token = 0;
  /** A build waiting for the viewer to come into view, so nobody misses it. */
  #pending = false;
  /** Parsed LDraw models, so switching back to a set doesn't parse it again. */
  readonly #cache = new Map<string, Group>();

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
    this.#renderer.localClippingEnabled = true;
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
    // Drawing stops once nothing moves; a drag starts it again.
    this.#controls.addEventListener('start', () => this.#loop());

    this.#resize = new ResizeObserver(() => {
      this.#fit();
      this.#loop();
    });
    this.#resize.observe(container);
    this.#fit();
    this.#loop();
  }

  /** Pause rendering while the viewer is scrolled out of sight. */
  setVisible(visible: boolean) {
    this.#visible = visible;
    if (visible && this.#pending) this.build();
    else if (visible) this.#loop();
  }

  async show(url: string, callbacks: BuildCallbacks = {}, download?: Promise<ArrayBuffer>) {
    const token = ++this.#token;
    this.#callbacks = callbacks;
    let model = this.#cache.get(url);
    if (!model) {
      model = await parseModel(await fetchModel(download ?? downloadModel(url)));
      // LDraw's y axis points down. Turning it over also turns an LDraw model's front, which faces -z, to face +z.
      model.rotation.x = Math.PI;
      this.#cache.set(url, model);
    }
    if (token !== this.#token) return;
    // Long, low models can fill the frame a little past their bounding sphere; a tall one, like a figure, needs all of it.
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    this.#place(model, new Vector3(0.9, 0.48, 1), size.y > Math.max(size.x, size.z) ? 1 : 0.78);

    const objects = collectUnits(model);
    const height = new Box3().setFromObject(model).getSize(new Vector3()).y;
    const schedule = buildSchedule(
      objects.map((object) => (object.userData['buildingStep'] as number | undefined) ?? 0),
      { dropMs: DROP_MS, targetMs: BUILD_MS },
    );
    this.#units = objects.map((object, index) => {
      const lift = dropOffset(object, height * 0.75);
      return { ...schedule.items[index]!, object, rest: object.position.clone(), lift };
    });
    this.#totalSteps = schedule.steps;
    this.build();
  }

  /** Show a scan of a finished build. `turn` (degrees about the vertical) faces its front to the camera. */
  async showScan(url: string, callbacks: BuildCallbacks = {}, turn = 0) {
    const token = ++this.#token;
    this.#callbacks = callbacks;
    const scan = await parseScan(url);
    if (token !== this.#token) {
      dispose(scan);
      return;
    }
    const plane = new Plane(new Vector3(0, -1, 0), 0);
    drawAsPhotographed(scan, [plane]);
    scan.rotation.y = (turn * Math.PI) / 180;
    // A glTF model faces +z. A scan can be any shape, so all of it stays in frame with room round it.
    this.#place(scan, new Vector3(0.9, 0.48, 1), 1.15);
    const box = new Box3().setFromObject(scan);
    const margin = (box.max.y - box.min.y) * 0.01;
    this.#rise = { plane, from: box.min.y - margin, to: box.max.y + margin };
    this.build();
  }

  /** Start the build from an empty baseplate. */
  build() {
    if (!this.#model) return;
    this.#controls.autoRotate = false;
    this.#lastStep = -1;
    if (this.#reducedMotion) {
      this.skip();
      return;
    }
    for (const unit of this.#units) unit.object.visible = false;
    if (this.#rise) this.#rise.plane.constant = this.#rise.from;
    // Loaded ahead of time, before the viewer is on screen: wait so the build is seen from the start.
    if (!this.#visible) {
      this.#pending = true;
      return;
    }
    this.#pending = false;
    this.#building = true;
    this.#start = performance.now();
    this.#loop();
  }

  /** Jump to the finished model. */
  skip() {
    if (!this.#model) return;
    this.#pending = false;
    for (const unit of this.#units) {
      unit.object.visible = true;
      unit.object.position.copy(unit.rest);
    }
    if (this.#rise) this.#rise.plane.constant = this.#rise.to;
    else {
      this.#lastStep = this.#totalSteps - 1;
      this.#callbacks.onProgress?.(this.#totalSteps, this.#totalSteps);
    }
    this.#finish();
    this.#loop();
  }

  get building() {
    return this.#building || this.#pending;
  }

  destroy() {
    cancelAnimationFrame(this.#frame);
    this.#resize.disconnect();
    this.#controls.dispose();
    if (this.#model && !this.#cached(this.#model)) dispose(this.#model);
    for (const model of this.#cache.values()) dispose(model);
    this.#cache.clear();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  #finish() {
    this.#building = false;
    // A slow turn shows the finished model off, unless the visitor asked for less motion.
    this.#controls.autoRotate = !this.#reducedMotion;
    this.#callbacks.onDone?.();
  }

  #cached(model: Object3D) {
    return [...this.#cache.values()].includes(model as Group);
  }

  /** Swap in a new model and frame it, looking from `view`. */
  #place(model: Object3D, view: Vector3, fill: number) {
    // Leave the old model whole, in case it's kept to show again; only a scan is thrown away.
    for (const unit of this.#units) {
      unit.object.visible = true;
      unit.object.position.copy(unit.rest);
    }
    this.#building = false;
    this.#pending = false;
    if (this.#model && this.#model !== model) {
      this.#scene.remove(this.#model);
      if (!this.#cached(this.#model)) dispose(this.#model);
    }
    this.#units = [];
    this.#rise = null;
    this.#scene.add(model);
    model.updateMatrixWorld(true);
    this.#model = model;
    this.#frameCamera(model, view, fill);
  }

  #fit() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  /** `fill` scales the distance that fits the model's bounding sphere in view. */
  #frameCamera(model: Object3D, view: Vector3, fill: number) {
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const radius = size.length() / 2;
    const vertical = (this.#camera.fov * Math.PI) / 360;
    const horizontal = Math.atan(Math.tan(vertical) * this.#camera.aspect);
    const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * fill;
    // A three-quarter view from the front and slightly above.
    const direction = view.clone().normalize();
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
    const moved = this.#controls.update();
    this.#renderer.render(this.#scene, this.#camera);
    // Keep drawing only while something is moving: the build, the turn, or a drag settling.
    if (this.#building || this.#controls.autoRotate || moved) this.#frame = requestAnimationFrame(this.#loop);
  };

  #tick(elapsed: number) {
    if (this.#rise) {
      const { plane, from, to } = this.#rise;
      const t = Math.min(elapsed / RISE_MS, 1);
      plane.constant = from + (to - from) * (1 - (1 - t) ** 2);
      if (t >= 1) this.#finish();
      return;
    }
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
