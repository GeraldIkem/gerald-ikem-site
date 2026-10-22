/**
 * Loads a packed LDraw model and builds it on screen in its real instruction
 * order: each building step's parts drop in from above and settle into place.
 * It plays like a video: at a chosen speed, paused, or a step back or forward
 * at a time. A scan of a finished build has no steps, so it rises into view from its base.
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
import {
  buildSchedule,
  dropOffset,
  pieceProgress,
  speedRate,
  stepTimes,
  type Scheduled,
  type StepTimes,
} from '~/lib/buildSchedule';

export interface PlayState {
  playing: boolean;
  /** Standing finished, so playing starts the build again. */
  atEnd: boolean;
}

export interface BuildCallbacks {
  /** The step on screen (0 before the first piece) out of how many, whenever it changes. */
  onProgress?: (step: number, steps: number) => void;
  /** Whenever it starts or stops playing. */
  onState?: (state: PlayState) => void;
}

interface Unit extends Scheduled {
  object: Object3D;
  rest: Vector3;
  lift: Vector3;
}

// How long one piece takes to drop into place, roughly how long a whole build runs, and how long a scan takes to
// rise, all at 2×; 1× takes twice as long.
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
  #steps: StepTimes = { starts: [], ends: [] };
  #duration = 0;
  /** The playhead: a time on the build's own timeline, which runs at 2×. */
  #time = 0;
  /** Timeline time per real millisecond, from the chosen speed. */
  #rate = speedRate(1);
  /** Where a step back or forward stops; null while it plays on to the end. */
  #target: number | null = null;
  /** How many steps stand finished once that step back or forward lands. */
  #landing = 0;
  #moving = false;
  /** Steps up to `#built` stand finished and steps after `#shown` stay hidden (see pieceProgress). */
  #built = -1;
  #shown = Infinity;
  #reported = -1;
  #last = 0;
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
    // Coming back to the tab picks the build up where it was.
    document.addEventListener('visibilitychange', this.#loop);
    this.#fit();
    this.#loop();
  }

  /** Pause rendering while the viewer is scrolled out of sight. */
  setVisible(visible: boolean) {
    this.#visible = visible;
    if (visible && this.#pending) this.play();
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
    this.#steps = stepTimes(schedule.items, schedule.steps, DROP_MS);
    this.#duration = schedule.durationMs;
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
    // Its rise counts as one step.
    this.#steps = { starts: [0], ends: [RISE_MS] };
    this.#duration = RISE_MS;
    this.build();
  }

  get steps() {
    return this.#steps.starts.length;
  }

  /** 1× is half the pace the builds first had; 2× is that pace. */
  setSpeed(speed: number) {
    this.#rate = speedRate(speed);
  }

  /** Start the build again from an empty baseplate. */
  build() {
    if (!this.#model) return;
    this.#settle(0);
    this.play();
  }

  /** Play on from where it stands, or from the start once it's finished. With less motion, show it finished. */
  play() {
    if (!this.#model) return;
    if (this.#reducedMotion) {
      this.seek(this.steps);
      return;
    }
    if (this.#atEnd()) this.#settle(0);
    this.#target = null;
    this.#shown = Infinity;
    this.#controls.autoRotate = false;
    // Loaded ahead of time, before the viewer is on screen: wait so the build is seen from the start.
    this.#pending = !this.#visible;
    this.#moving = this.#visible;
    this.#emit();
    this.#loop();
  }

  pause() {
    this.#moving = false;
    this.#pending = false;
    this.#target = null;
    this.#controls.autoRotate = false;
    this.#emit();
  }

  /**
   * One step forward or back from where it stands. Forward finishes the step being built, or drops in
   * the next one; back lifts the latest step's pieces off again, last one first.
   */
  stepBy(delta: 1 | -1) {
    if (!this.#model) return;
    const { step, whole } = this.#position();
    const target = delta > 0 ? (whole ? step + 1 : step) : step - 1;
    if (target >= this.steps || target < -1) return;
    this.#pending = false;
    this.#controls.autoRotate = false;
    if (this.#reducedMotion || this.#rise) {
      this.seek(target + 1);
      return;
    }
    if (delta > 0) {
      this.#built = target - 1;
      this.#shown = target;
      if (whole) this.#time = this.#steps.starts[target]!;
      this.#target = this.#steps.ends[target]!;
    } else {
      this.#built = step - 1;
      this.#shown = step;
      if (whole) this.#time = this.#steps.ends[step]!;
      this.#target = this.#steps.starts[step]!;
    }
    this.#landing = target + 1;
    this.#moving = true;
    this.#emit();
    this.#loop();
  }

  /** Stand still with the first `count` steps finished. */
  seek(count: number) {
    if (!this.#model) return;
    this.#moving = false;
    this.#pending = false;
    this.#target = null;
    this.#controls.autoRotate = false;
    this.#settle(Math.min(Math.max(count, 0), this.steps));
    this.#emit();
    this.#loop();
  }

  destroy() {
    cancelAnimationFrame(this.#frame);
    document.removeEventListener('visibilitychange', this.#loop);
    this.#resize.disconnect();
    this.#controls.dispose();
    if (this.#model && !this.#cached(this.#model)) dispose(this.#model);
    for (const model of this.#cache.values()) dispose(model);
    this.#cache.clear();
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  /** Put the playhead at the end of `count` steps, with nothing after them showing. */
  #settle(count: number) {
    this.#built = count - 1;
    this.#shown = count - 1;
    this.#time = count < this.steps ? this.#steps.starts[count]! : this.#duration;
    this.#apply();
  }

  #atEnd() {
    return !this.#moving && !this.#pending && this.#built >= this.steps - 1;
  }

  #emit() {
    this.#callbacks.onState?.({ playing: (this.#moving && this.#target === null) || this.#pending, atEnd: this.#atEnd() });
  }

  #progress(unit: Unit) {
    return pieceProgress(unit, this.#time, DROP_MS, this.#built, this.#shown);
  }

  /** The latest step with any piece showing, and whether all of its pieces are in place. */
  #position(): { step: number; whole: boolean } {
    if (this.#rise) return { step: this.#time > 0 ? 0 : -1, whole: this.#time >= this.#duration };
    let step = -1;
    for (const unit of this.#units) if (this.#progress(unit) > 0) step = Math.max(step, unit.step);
    const whole = this.#units.every((unit) => unit.step !== step || this.#progress(unit) >= 1);
    return { step, whole };
  }

  /** Place every piece, or the scan's rising line, for where the playhead is. */
  #apply() {
    if (this.#rise) {
      const { plane, from, to } = this.#rise;
      const t = this.#duration ? Math.min(this.#time / this.#duration, 1) : 1;
      plane.constant = from + (to - from) * (1 - (1 - t) ** 2);
      return;
    }
    let step = -1;
    for (const unit of this.#units) {
      const p = this.#progress(unit);
      unit.object.visible = p > 0;
      if (p <= 0) continue;
      step = Math.max(step, unit.step);
      // Ease out with a small settle, like a brick clicking onto studs.
      const k = 1 - (1 - p) ** 3;
      unit.object.position.copy(unit.rest).addScaledVector(unit.lift, 1 - k);
    }
    if (step !== this.#reported) {
      this.#reported = step;
      this.#callbacks.onProgress?.(step + 1, this.steps);
    }
  }

  /** Move the playhead on by `ms` of real time. */
  #advance(ms: number) {
    const delta = ms * this.#rate;
    if (this.#target === null) {
      this.#time = Math.min(this.#time + delta, this.#duration);
      this.#apply();
      if (this.#time >= this.#duration) this.#finish();
      return;
    }
    const target = this.#target;
    this.#time = target >= this.#time ? Math.min(this.#time + delta, target) : Math.max(this.#time - delta, target);
    this.#apply();
    if (this.#time === target) {
      // A step back or forward has landed: stand still at the end of it.
      this.#moving = false;
      this.#target = null;
      this.#settle(this.#landing);
      this.#emit();
    }
  }

  #finish() {
    this.#moving = false;
    this.#built = this.steps - 1;
    this.#shown = this.steps - 1;
    // A slow turn shows the finished model off, unless the visitor asked for less motion.
    this.#controls.autoRotate = !this.#reducedMotion;
    this.#emit();
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
    this.#moving = false;
    this.#pending = false;
    this.#target = null;
    this.#reported = -2;
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
    if (!this.#visible || document.hidden) {
      this.#last = 0;
      return;
    }
    const now = performance.now();
    // A long gap (a slow frame, or coming back to the page) doesn't jump the build ahead.
    if (this.#moving) this.#advance(this.#last ? Math.min(now - this.#last, 100) : 0);
    this.#last = this.#moving ? now : 0;
    const moved = this.#controls.update();
    this.#renderer.render(this.#scene, this.#camera);
    // Keep drawing only while something is moving: the build, the turn, or a drag settling.
    if (this.#moving || this.#controls.autoRotate || moved) this.#frame = requestAnimationFrame(this.#loop);
  };
}
