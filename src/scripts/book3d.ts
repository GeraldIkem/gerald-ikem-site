/**
 * A hardcover book in three.js: two boards that overhang the page block, a
 * rounded spine, page edges and headbands. The front, spine and back each take
 * their own image, so a book can wear its real jacket.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface BookSpec {
  front: string;
  spine?: string | undefined;
  back?: string | undefined;
  /** Cover width divided by height. */
  ratio: number;
  /** Spine thickness divided by height. */
  depth: number;
  /** Jacket colour, for edges and for any face without an image. */
  color: string;
  /** Printed on the spine when there's no spine image. */
  title?: string;
  publisher?: string;
  textColor?: string;
}

const loader = new TextureLoader();

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) =>
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      reject,
    ),
  );
}

/** Fine lines for page edges; `across` draws them vertically instead. */
function pageTexture(across: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f2ede1';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    ctx.fillStyle = `rgba(120, 104, 80, ${0.08 + ((i * 37) % 11) / 100})`;
    if (across) ctx.fillRect(i, 0, 1, 256);
    else ctx.fillRect(0, i, 256, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** The little striped cloth band at the top and bottom of a bound spine. */
function headbandTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  for (let x = 0; x < 64; x += 8) {
    ctx.fillStyle = '#a3262a';
    ctx.fillRect(x, 0, 4, 8);
    ctx.fillStyle = '#f1e6cf';
    ctx.fillRect(x + 4, 0, 4, 8);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Without a photo of the real spine, print what a spine always carries: the
 * title, top to bottom, and the publisher at the foot, on the jacket colour.
 */
function spineLabelTexture(spec: BookSpec): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = spec.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 214, 130, 0.7)';
  ctx.fillRect(0, 40, canvas.width, 6);
  ctx.fillRect(0, 60, canvas.width, 3);
  ctx.fillRect(0, canvas.height - 150, canvas.width, 4);
  ctx.fillStyle = spec.textColor || '#ffffff';
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  if (spec.publisher) {
    ctx.font = `700 64px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.publisher.toUpperCase(), canvas.width / 2, canvas.height - 80, canvas.width * 0.85);
  }
  if (spec.title) {
    ctx.save();
    ctx.translate(canvas.width / 2, (canvas.height - 150 + 90) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.font = `650 88px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.title, 0, 0, canvas.height - 320);
    ctx.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A soft shadow for the book to stand on. */
function shadowTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

const jacket = (map: Texture | null, color: string) =>
  new MeshPhysicalMaterial({
    map,
    color: map ? 0xffffff : new Color(color),
    roughness: 0.5,
    clearcoat: 0.45,
    clearcoatRoughness: 0.4,
  });

async function buildBook(spec: BookSpec): Promise<Group> {
  const [front, spine, back] = await Promise.all([
    loadTexture(spec.front),
    spec.spine ? loadTexture(spec.spine).catch(() => null) : Promise.resolve(null),
    spec.back ? loadTexture(spec.back).catch(() => null) : Promise.resolve(null),
  ]);

  const H = 1;
  const W = H * spec.ratio;
  const T = Math.max(H * spec.depth, 0.05);
  const board = 0.014;
  const overhang = 0.012;
  const edge = new MeshStandardMaterial({ color: new Color(spec.color).multiplyScalar(0.75), roughness: 0.8 });

  const book = new Group();

  // Boards: the front faces +z, the spine sits on the left at -x.
  const boardGeometry = new BoxGeometry(W, H, board);
  const frontBoard = new Mesh(boardGeometry, [edge, edge, edge, edge, jacket(front, spec.color), edge]);
  frontBoard.position.set(0, 0, T / 2 - board / 2);
  const backBoard = new Mesh(boardGeometry, [edge, edge, edge, edge, edge, jacket(back, spec.color)]);
  backBoard.position.set(0, 0, -T / 2 + board / 2);

  // Rounded spine: half a cylinder from the back board, round the left, to the front board.
  const spineGeometry = new CylinderGeometry(T / 2, T / 2, H, 32, 1, true, Math.PI, Math.PI);
  const spineMesh = new Mesh(spineGeometry, jacket(spine ?? spineLabelTexture(spec), spec.color));
  spineMesh.position.set(-W / 2, 0, 0);
  spineMesh.scale.set(0.55, 1, 1);

  // Page block, set in from the boards' edges.
  const pagesW = W - overhang;
  const pagesH = H - overhang * 2;
  const pagesT = T - board * 2;
  const fore = pageTexture(true);
  fore.repeat.set(pagesT * 40, 1);
  const topEdge = pageTexture(false);
  topEdge.repeat.set(1, pagesT * 40);
  const foreEdge = new MeshStandardMaterial({ map: fore, roughness: 0.9 });
  const headEdge = new MeshStandardMaterial({ map: topEdge, roughness: 0.9 });
  const plain = new MeshStandardMaterial({ color: 0xf2ede1, roughness: 0.9 });
  const pages = new Mesh(new BoxGeometry(pagesW, pagesH, pagesT), [foreEdge, plain, headEdge, headEdge, plain, plain]);
  pages.position.set(-overhang / 2, 0, 0);

  // Headbands where the page block meets the spine.
  const band = new MeshStandardMaterial({ map: headbandTexture(), roughness: 0.7 });
  const bandGeometry = new CylinderGeometry(0.006, 0.006, pagesT * 0.92, 12);
  for (const y of [pagesH / 2, -pagesH / 2]) {
    const headband = new Mesh(bandGeometry, band);
    headband.rotation.x = Math.PI / 2;
    headband.position.set(-W / 2 + 0.008, y, 0);
    book.add(headband);
  }

  book.add(frontBoard, backBoard, spineMesh, pages);

  const shadow = new Mesh(
    new PlaneGeometry(W * 1.9, T * 3.2),
    new MeshStandardMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -H / 2 - 0.001, 0);
  book.add(shadow);

  return book;
}

function dispose(root: Group) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as Material | Material[] | undefined;
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      (m as MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  });
}

export class BookStage {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(30, 1, 0.05, 20);
  readonly #controls: OrbitControls;
  readonly #resize: ResizeObserver;
  readonly #reducedMotion: boolean;
  #book: Group | null = null;
  #token = 0;
  #frame = 0;
  #turnFrom = 0;
  #turnStart = 0;
  #visible = true;

  constructor(
    private readonly container: HTMLElement,
    options: { reducedMotion: boolean; interactive: boolean },
  ) {
    this.#reducedMotion = options.reducedMotion;
    this.#renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    container.append(this.#renderer.domElement);

    const pmrem = new PMREMGenerator(this.#renderer);
    this.#scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.#scene.environmentIntensity = 0.55;
    this.#scene.add(new HemisphereLight(0xffffff, 0x8a7a66, 1.1));
    const key = new DirectionalLight(0xffffff, 1.6);
    key.position.set(1.5, 2.5, 2.5);
    this.#scene.add(key);

    this.#camera.position.set(0, 0.08, 2.75);
    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableDamping = true;
    this.#controls.enablePan = false;
    this.#controls.enableZoom = false;
    this.#controls.minPolarAngle = Math.PI * 0.32;
    this.#controls.maxPolarAngle = Math.PI * 0.62;
    this.#controls.enabled = options.interactive;
    this.#controls.autoRotateSpeed = 2.2;
    this.#controls.addEventListener('start', () => (this.#controls.autoRotate = false));

    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(container);
    this.#fit();
    this.#loop();
  }

  setVisible(visible: boolean) {
    this.#visible = visible;
    if (visible) this.#loop();
  }

  async show(spec: BookSpec) {
    const token = ++this.#token;
    const book = await buildBook(spec);
    if (token !== this.#token) {
      dispose(book);
      return;
    }
    if (this.#book) {
      this.#scene.remove(this.#book);
      dispose(this.#book);
    }
    this.#book = book;
    this.#scene.add(book);

    // Reset the view, then turn the book from spine-on to a three-quarter front view.
    this.#controls.reset();
    this.#controls.autoRotate = false;
    if (this.#reducedMotion) {
      book.rotation.y = 0.45;
    } else {
      this.#turnFrom = Math.PI / 2;
      book.rotation.y = this.#turnFrom;
      this.#turnStart = performance.now();
    }
    this.#loop();
  }

  destroy() {
    cancelAnimationFrame(this.#frame);
    this.#resize.disconnect();
    this.#controls.dispose();
    if (this.#book) dispose(this.#book);
    this.#renderer.dispose();
    this.#renderer.domElement.remove();
  }

  #fit() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (!width || !height) return;
    this.#renderer.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  }

  #loop = () => {
    cancelAnimationFrame(this.#frame);
    if (!this.#visible || document.hidden) return;
    if (this.#book && this.#turnStart) {
      const t = Math.min((performance.now() - this.#turnStart) / 1300, 1);
      const eased = 1 - (1 - t) ** 3;
      this.#book.rotation.y = this.#turnFrom + (0.45 - this.#turnFrom) * eased;
      if (t === 1) {
        this.#turnStart = 0;
        // Once it has landed, let it turn slowly so the spine and back come round too.
        this.#controls.autoRotate = !this.#reducedMotion;
      }
    }
    this.#controls.update();
    this.#renderer.render(this.#scene, this.#camera);
    this.#frame = requestAnimationFrame(this.#loop);
  };
}
