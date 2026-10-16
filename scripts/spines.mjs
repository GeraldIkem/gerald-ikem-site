// Turns photos of my books' spines and back covers into the images the shelf and
// the 3D book use. Each photo is named by the book's id from src/data/comics.json:
//
//   photos/1143890-spine.jpg   photos/1143890-back.jpg
//
// The script finds the book against the background, straightens it (rotation and
// perspective), crops it, evens out the lighting and matches the colours to the
// book's front cover (see correct() below), writes public/spines/<id>.webp and
// public/backs/<id>.webp, and fills in spineImage, spineRatio and backImage.
// Shoot each book square-on, flash off, on a plain background that contrasts
// with it, with a margin of background on every side.
//
// Usage:
//   node scripts/spines.mjs [folder]   process the photos in folder (default: photos/)
//   node scripts/spines.mjs --missing  list the books that still need a spine or a back
//
// Options:
//   --debug   also write <folder>/debug/<name>.png with the outline it found
//   --scan    the images are already flat and cropped (scans): skip the detection
//   --dry-run write the results to <folder>/out/ and leave the site's files alone
//
// When the outline comes out wrong, <folder>/fixes.json can override it per image:
//   { "1143890-spine": { "corners": [[x, y], [x, y], [x, y], [x, y]], "rotate": 90 } }
// Corners are top-left, top-right, bottom-right, bottom-left of the book in the
// photo's pixels. They only need to be close: each side snaps to the edge next to
// it ("snap": false turns that off). "trim": { "right": 0.02 } pulls a side in by a
// fraction of the book. A back always takes the front cover's proportions; "ratio"
// (width over height) sets a spine's when the photo was taken at an angle.
// "crop": [left, top, width, height] cuts a region out first, and "from": "file.jpg"
// reads another file, so one photo of a full jacket can give both the spine and
// the back. "scan": true skips detection for that image. "glare": false leaves
// bright patches alone and a number (default 0.15) sets how much haze can come off, "correct": false skips the colour and lighting correction,
// and "drop": true removes that book's spine or back so it falls back to the
// printed one. "source" and "url" record where an image came from in
// src/data/comic-image-sources.json.

import { mkdir, readFile, readdir, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'src', 'data', 'comics.json');
const sourcesPath = path.join(root, 'src', 'data', 'comic-image-sources.json');
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const dryRun = flags.has('--dry-run');
const folder = path.resolve(args.find((arg) => !arg.startsWith('--')) ?? path.join(root, 'photos'));

/** Output sizes: backs match the front covers from scripts/covers.mjs. */
const BACK_WIDTH = 520;
const SPINE_HEIGHT = 1000;
const ANALYSIS_SIZE = 900;
const NAME = /^(\d+)[-_ ](spine|back)\.(jpe?g|png|webp|avif|tiff?|heic|heif)$/i;

const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const clamp = (value, low, high) => Math.min(Math.max(value, low), high);
const smooth = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const coverCache = new Map();
const exists = (file) => access(file).then(() => true, () => false);
const readJson = async (file, fallback) => ((await exists(file)) ? JSON.parse(await readFile(file, 'utf8')) : fallback);
const books = JSON.parse(await readFile(dataPath, 'utf8'));
const byId = new Map(books.map((book) => [book.id, book]));

if (flags.has('--missing')) {
  listMissing();
  process.exit(0);
}

if (!(await exists(folder))) {
  console.error(`No folder at ${folder}. Put the photos there, or pass the folder: node scripts/spines.mjs <folder>`);
  process.exit(1);
}

const fixes = await readJson(path.join(folder, 'fixes.json'), {});
const sources = await readJson(sourcesPath, {});
const files = (await readdir(folder)).filter((file) => NAME.test(file));
// fixes.json can name outputs whose image lives in another file ("from").
const jobs = new Map(files.map((file) => [file.replace(/\.[^.]+$/, '').replace(/[_ ]/, '-').toLowerCase(), file]));
for (const [key, fix] of Object.entries(fixes)) if (fix.from && !jobs.has(key)) jobs.set(key, fix.from);

if (!jobs.size) {
  console.error(`No photos named like 1143890-spine.jpg or 1143890-back.jpg in ${folder}.`);
  process.exit(1);
}

let done = 0;
const problems = [];
for (const [key, file] of [...jobs].sort()) {
  const [, id, kind] = /^(\d+)-(spine|back)$/.exec(key) ?? [];
  const book = byId.get(id);
  if (!book || !kind) {
    problems.push(`${file}: no book with id ${id} in comics.json`);
    continue;
  }
  if (/\.hei[cf]$/i.test(file)) {
    problems.push(`${file}: HEIC can't be read here. Export it as JPEG (or set the iPhone camera to Most Compatible).`);
    continue;
  }
  try {
    const fix = fixes[key] ?? {};
    // A back is the same size as the front, so it takes the front's proportions.
    const ratio = fix.ratio ?? (kind === 'back' ? book.coverRatio : undefined);
    if (fix.drop) {
      // A photo that still looks wrong after correction: the book falls back to the printed spine.
      if (!dryRun) await rm(path.join(root, 'public', kind === 'spine' ? 'spines' : 'backs', `${id}.webp`), { force: true });
      if (kind === 'spine') {
        delete book.spineImage;
        delete book.spineRatio;
      } else {
        delete book.backImage;
      }
      if (sources[id]) delete sources[id][kind];
      if (sources[id] && !Object.keys(sources[id]).length) delete sources[id];
      console.log(`drop  ${kind} of ${book.title}`);
      continue;
    }
    const result = await processPhoto(path.join(folder, file), kind, fix, key, ratio, book);
    const outDir = dryRun ? path.join(folder, 'out') : path.join(root, 'public', kind === 'spine' ? 'spines' : 'backs');
    await mkdir(outDir, { recursive: true });
    await result.image.webp({ quality: 82 }).toFile(path.join(outDir, dryRun ? `${key}.webp` : `${id}.webp`));
    if (kind === 'spine') {
      book.spineImage = `/spines/${id}.webp`;
      book.spineRatio = Math.round((result.width / result.height) * 1000) / 1000;
    } else {
      book.backImage = `/backs/${id}.webp`;
      const ratio = result.width / result.height;
      if (book.coverRatio && Math.abs(ratio / book.coverRatio - 1) > 0.06) {
        problems.push(`${file}: the back comes out at ${ratio.toFixed(3)} wide per tall, the front is ${book.coverRatio}. Check the crop.`);
      }
    }
    sources[id] = { ...sources[id], [kind]: { source: fix.source ?? 'Photo of my copy', ...(fix.url ? { url: fix.url } : {}) } };
    for (const note of result.notes) problems.push(`${file}: ${note}`);
    done += 1;
    console.log(`${kind.padEnd(5)} ${book.title} (${result.width}×${result.height})`);
  } catch (error) {
    problems.push(`${file}: ${error.message}`);
  }
}

if (!dryRun) {
  await writeFile(dataPath, `${JSON.stringify(books, null, 2)}\n`, 'utf8');
  await writeFile(sourcesPath, `${JSON.stringify(sortKeys(sources), null, 2)}\n`, 'utf8');
}
console.log(`\nProcessed ${done} of ${jobs.size} images${dryRun ? ` into ${path.join(folder, 'out')}` : ''}.`);
if (problems.length) console.log(`Check these:\n  ${problems.join('\n  ')}`);

/** Straighten and crop one photo; returns a sharp pipeline sized for the site. */
async function processPhoto(file, kind, fix, key, ratio, book) {
  const notes = [];
  let input = await sharp(await readFile(file))
    .rotate()
    .png({ compressionLevel: 1 })
    .toBuffer();
  if (fix.crop) {
    const [left, top, width, height] = fix.crop.map(Math.round);
    input = await sharp(input).extract({ left, top, width, height }).png({ compressionLevel: 1 }).toBuffer();
  }

  const scan = fix.scan || flags.has('--scan');
  let flat = input;
  if (!scan) {
    let corners = fix.corners ?? (await findCorners(input, notes, key));
    // Corners typed in by hand only need to be close: each side snaps to the edge beside it.
    if (fix.corners && fix.snap !== false) corners = await snapCorners(input, corners, notes, fix.reach);
    if (fix.trim) corners = trim(corners, fix.trim);
    flat = await warp(input, corners, ratio);
    // Any background still showing along an edge comes off.
    const leftover = await backgroundAtEdges(flat, await backgroundAround(input, corners));
    if (leftover) {
      corners = trim(corners, leftover);
      flat = await warp(input, corners, ratio);
    }
    if (flags.has('--debug')) await drawDebug(input, corners, key);
  }
  if (fix.rotate) flat = await sharp(flat).rotate(fix.rotate).png({ compressionLevel: 1 }).toBuffer();

  let { width, height } = await sharp(flat).metadata();
  if (width > height && !fix.rotate) {
    // Spines and backs both stand taller than wide. Turn a sideways photo so the
    // book's head, assumed to be on the left, ends up at the top.
    flat = await sharp(flat).rotate(90).png({ compressionLevel: 1 }).toBuffer();
    [width, height] = [height, width];
    notes.push('the photo was sideways, so it was turned a quarter clockwise. If it is upside down, add "rotate": 270 in fixes.json.');
  }

  const size = kind === 'spine' ? { height: Math.min(SPINE_HEIGHT, height) } : { width: Math.min(BACK_WIDTH, width) };
  const scale = size.height ? size.height / height : size.width / width;
  const out = { width: Math.round(width * scale), height: Math.round(height * scale) };
  const { data } = await sharp(flat)
    .resize({ ...out, fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const corrected =
    fix.correct === false
      ? data
      : await correct(data, out.width, out.height, { cover: book.cover, scan, glare: fix.glare === false ? 0 : typeof fix.glare === 'number' ? fix.glare : 0.15 });
  return {
    image: sharp(corrected, { raw: { width: out.width, height: out.height, channels: 3 } }),
    width: out.width,
    height: out.height,
    notes,
  };
}

/** Median colour of the photo just outside the book's outline. */
async function backgroundAround(input, corners) {
  const { data, info } = await sharp(input)
    .resize({ width: ANALYSIS_SIZE, height: ANALYSIS_SIZE, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const scale = info.width / (await sharp(input).metadata()).width;
  const c = corners.map(([x, y]) => [x * scale, y * scale]);
  const centre = [c.reduce((s, p) => s + p[0], 0) / 4, c.reduce((s, p) => s + p[1], 0) / 4];
  const gap = Math.max(info.width, info.height) * 0.02;
  const samples = [];
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    for (let t = 0.1; t <= 0.9; t += 0.02) {
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const away = [p[0] - centre[0], p[1] - centre[1]];
      const length = Math.hypot(...away) || 1;
      const x = Math.round(p[0] + (away[0] / length) * gap);
      const y = Math.round(p[1] + (away[1] / length) * gap);
      if (x < 0 || y < 0 || x >= info.width || y >= info.height) continue;
      const k = (y * info.width + x) * 3;
      samples.push([data[k], data[k + 1], data[k + 2]]);
    }
  }
  if (samples.length < 12) return null;
  const median = (values) => values.sort((p, q) => p - q)[values.length >> 1];
  const colour = [0, 1, 2].map((ch) => median(samples.map((s) => s[ch])));
  const spread = median(samples.map((s) => Math.hypot(s[0] - colour[0], s[1] - colour[1], s[2] - colour[2])));
  return { colour, spread };
}

/**
 * How much of each edge of the straightened book is still background: lines of
 * pixels, counted in from the edge, where most pixels match the background colour.
 * Returns fractions for trim(), or null when the edges are clean.
 */
async function backgroundAtEdges(flat, background) {
  // A busy background (a shelf, a patterned rug) can't be told apart from the book.
  if (!background || background.spread > 35) return null;
  const { data, info } = await sharp(flat)
    .resize({ width: 600, height: 600, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const limit = Math.min(Math.max(30, background.spread * 2.5), 55);
  const isBackground = (x, y) => {
    const k = (y * w + x) * 3;
    const [r, g, b] = background.colour;
    return Math.hypot(data[k] - r, data[k + 1] - g, data[k + 2] - b) < limit;
  };
  const run = (count, length, at) => {
    let lines = 0;
    for (let i = 0; i < Math.ceil(count * 0.03); i++) {
      let matches = 0;
      for (let j = 0; j < length; j++) if (at(i, j)) matches += 1;
      if (matches / length < 0.7) break;
      lines = i + 1;
    }
    return lines ? lines / count + 0.003 : 0;
  };
  const edges = {
    top: run(h, w, (i, j) => isBackground(j, i)),
    bottom: run(h, w, (i, j) => isBackground(j, h - 1 - i)),
    left: run(w, h, (i, j) => isBackground(i, j)),
    right: run(w, h, (i, j) => isBackground(w - 1 - i, j)),
  };
  return Object.values(edges).some(Boolean) ? edges : null;
}

/*
 * Colour and lighting correction, so photos taken in different rooms sit together
 * on the shelf. It only adjusts the pixels that are there, in this order:
 *  1. Flatten uneven lighting: divide out a large-radius illumination map (a heavy
 *     blur of the brightness), at partial strength so the design's own light and
 *     dark areas survive.
 *  2. Remove glare: shrinkwrap glare is white light added on top of the artwork, so
 *     a broad bright patch that is paler than the colours around it has that excess
 *     subtracted.
 *  3. White balance from the photo's near-white areas (barcode box, white type).
 *  4. Match the book's own clean front cover from CLZ: black and white points (so
 *     brightness and contrast agree) and the spread of its colours, at partial
 *     strength, since the back and spine carry different artwork from the front.
 * Scans skip the first two: their lighting is already even.
 */
async function correct(data, w, h, { cover, scan, glare }) {
  const n = w * h;
  const lin = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) lin[i] = SRGB_TO_LINEAR[data[i]];
  const long = Math.max(w, h);
  const luminance = () => {
    const y = new Float32Array(n);
    for (let p = 0; p < n; p++) y[p] = 0.2126 * lin[p * 3] + 0.7152 * lin[p * 3 + 1] + 0.0722 * lin[p * 3 + 2];
    return y;
  };

  if (!scan) {
    // 1. Illumination: geometric mean brightness over a third of the book.
    const y = luminance();
    const logY = new Float32Array(n);
    for (let p = 0; p < n; p++) logY[p] = Math.log(y[p] + 0.01);
    const light = blur(logY, w, h, long * 0.3);
    let mean = 0;
    for (let p = 0; p < n; p++) mean += light[p];
    mean /= n;
    for (let p = 0; p < n; p++) {
      const gain = Math.min(Math.max(Math.exp((mean - light[p]) * 0.6), 0.78), 1.3);
      for (let c = 0; c < 3; c++) lin[p * 3 + c] *= gain;
    }

    // 2. Glare is white light added on top of the print, so it is subtracted, never painted over.
    if (glare) {
      const y2 = luminance();
      const saturation = new Float32Array(n);
      const darkest = new Float32Array(n);
      for (let p = 0; p < n; p++) {
        const r = lin[p * 3];
        const g = lin[p * 3 + 1];
        const b = lin[p * 3 + 2];
        const max = Math.max(r, g, b);
        darkest[p] = Math.min(r, g, b);
        saturation[p] = max > 0.01 ? (max - darkest[p]) / max : 0;
      }
      // A broad patch that is brighter and paler than the colours around it.
      const near = blur(y2, w, h, long * 0.012);
      const around = blur(y2, w, h, long * 0.07);
      const nearSat = blur(saturation, w, h, long * 0.012);
      const aroundSat = blur(saturation, w, h, long * 0.07);
      // A veil: in print, the weakest of the three channels is near zero somewhere in
      // almost every small neighbourhood (black, or a saturated colour). Where even that
      // minimum is lifted across a broad patch, the lift is glare. Thin white type sits
      // next to black, so it doesn't count.
      const veil = blur(minFilter(darkest, w, h, Math.max(2, Math.round(long * 0.015))), w, h, long * 0.03);
      const floor = percentile(veil, 0.2);
      for (let p = 0; p < n; p++) {
        const excess = near[p] - around[p];
        const patch = excess * smooth((excess - 0.012) / 0.06) * smooth((aroundSat[p] - nearSat[p] - 0.03) / 0.12) * 0.9;
        const lift = clamp(veil[p] - floor, 0, glare) * 0.8;
        const remove = Math.max(patch, lift);
        if (remove > 0) for (let c = 0; c < 3; c++) lin[p * 3 + c] = Math.max(lin[p * 3 + c] - remove, 0);
      }
    }
  }

  const lab = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) linearToLab(lin, p * 3, lab, p * 3);

  // 3. White balance: near-white pixels should have no tint.
  let count = 0;
  let sumA = 0;
  let sumB = 0;
  for (let p = 0; p < n; p++) {
    const k = p * 3;
    if (lab[k] > 65 && Math.hypot(lab[k + 1], lab[k + 2]) < 14) {
      count += 1;
      sumA += lab[k + 1];
      sumB += lab[k + 2];
    }
  }
  if (count > n * 0.003) {
    const shiftA = clamp(sumA / count, -10, 10);
    const shiftB = clamp(sumB / count, -10, 10);
    for (let p = 0; p < n; p++) {
      lab[p * 3 + 1] -= shiftA;
      lab[p * 3 + 2] -= shiftB;
    }
  }

  // 4. Tone and colour from the front cover.
  const reference = cover ? await coverStats(cover) : null;
  if (reference) {
    const own = labStats(lab, n);
    // Black and white points: a lifted, hazy black or a dull white moves toward the cover's.
    const black = own.l1 + clamp(reference.l1 - own.l1, -20, 20) * 0.9;
    const white = own.l99 + clamp(reference.l99 - own.l99, -15, 15) * 0.8;
    const stretch = clamp((white - black) / Math.max(own.l99 - own.l1, 1), 0.85, 1.45);
    // The colours' spread and centre move partway toward the cover's.
    const spreadA = 1 + (clamp(reference.sa / Math.max(own.sa, 1), 0.8, 1.3) - 1) * 0.5;
    const spreadB = 1 + (clamp(reference.sb / Math.max(own.sb, 1), 0.8, 1.3) - 1) * 0.5;
    const shiftA = clamp(reference.ma - own.ma, -8, 8) * 0.5;
    const shiftB = clamp(reference.mb - own.mb, -8, 8) * 0.5;
    for (let p = 0; p < n; p++) {
      const k = p * 3;
      lab[k] = clamp(black + (lab[k] - own.l1) * stretch, 0, 100);
      lab[k + 1] = own.ma + (lab[k + 1] - own.ma) * spreadA + shiftA;
      lab[k + 2] = own.mb + (lab[k + 2] - own.mb) * spreadB + shiftB;
    }
  }

  const out = Buffer.alloc(n * 3);
  for (let p = 0; p < n; p++) labToSrgb(lab, p * 3, out, p * 3);
  return out;
}

/** Linear sRGB to CIELAB (D65). */
function linearToLab(src, i, dst, j) {
  const r = src[i];
  const g = src[i + 1];
  const b = src[i + 2];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  dst[j] = 116 * fy - 16;
  dst[j + 1] = 500 * (fx - fy);
  dst[j + 2] = 200 * (fy - fz);
}

/** CIELAB (D65) to 8-bit sRGB. */
function labToSrgb(src, i, dst, j) {
  const fy = (src[i] + 16) / 116;
  const fx = fy + src[i + 1] / 500;
  const fz = fy - src[i + 2] / 200;
  const inv = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = 0.95047 * inv(fx);
  const y = inv(fy);
  const z = 1.08883 * inv(fz);
  const rgb = [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
  for (let c = 0; c < 3; c++) {
    const v = clamp(rgb[c], 0, 1);
    dst[j + c] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  }
}

/** Percentiles of lightness and the centre and spread of each colour axis. */
function labStats(lab, n) {
  const step = Math.max(1, Math.floor(n / 60000));
  const l = [];
  const a = [];
  const b = [];
  for (let p = 0; p < n; p += step) {
    l.push(lab[p * 3]);
    a.push(lab[p * 3 + 1]);
    b.push(lab[p * 3 + 2]);
  }
  const sorted = (values) => values.sort((x, y) => x - y);
  const at = (values, q) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
  sorted(l);
  sorted(a);
  sorted(b);
  return {
    l1: at(l, 0.01),
    l99: at(l, 0.99),
    ma: at(a, 0.5),
    mb: at(b, 0.5),
    sa: (at(a, 0.84) - at(a, 0.16)) / 2,
    sb: (at(b, 0.84) - at(b, 0.16)) / 2,
  };
}

async function coverStats(cover) {
  if (!coverCache.has(cover)) {
    const file = path.join(root, 'public', cover);
    let stats = null;
    if (await exists(file)) {
      const { data, info } = await sharp(file)
        .resize({ width: 260 })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const n = info.width * info.height;
      const lin = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) lin[i] = SRGB_TO_LINEAR[data[i]];
      const lab = new Float32Array(n * 3);
      for (let p = 0; p < n; p++) linearToLab(lin, p * 3, lab, p * 3);
      stats = labStats(lab, n);
    }
    coverCache.set(cover, stats);
  }
  return coverCache.get(cover);
}

/** Smallest value within `radius` pixels, each way. */
function minFilter(values, w, h, radius) {
  const across = new Float32Array(values.length);
  const out = new Float32Array(values.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let low = Infinity;
      for (let i = Math.max(0, x - radius); i <= Math.min(w - 1, x + radius); i++) low = Math.min(low, values[y * w + i]);
      across[y * w + x] = low;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let low = Infinity;
      for (let i = Math.max(0, y - radius); i <= Math.min(h - 1, y + radius); i++) low = Math.min(low, across[i * w + x]);
      out[y * w + x] = low;
    }
  }
  return out;
}

function percentile(values, q) {
  const step = Math.max(1, Math.floor(values.length / 50000));
  const sample = [];
  for (let i = 0; i < values.length; i += step) sample.push(values[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(sample.length * q))];
}

/** Gaussian-like blur: three box passes each way, edges averaging only what's there. */
function blur(values, w, h, sigma) {
  const radius = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(values);
  let b = new Float32Array(values.length);
  const pass = (src, dst, length, count, index) => {
    const prefix = new Float64Array(length + 1);
    for (let line = 0; line < count; line++) {
      for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i] + src[index(line, i)];
      for (let i = 0; i < length; i++) {
        const lo = Math.max(0, i - radius);
        const hi = Math.min(length - 1, i + radius);
        dst[index(line, i)] = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(a, b, w, h, (y, x) => y * w + x);
    pass(b, a, h, w, (x, y) => y * w + x);
  }
  return a;
}

/**
 * Find the book's four corners. The background is whatever colour fills the
 * photo's border, the book is the biggest patch that differs from it, and each
 * side is a line fitted to that patch's edge, so rounded corners don't throw it.
 */
async function findCorners(input, notes, key) {
  const { data, info } = await sharp(input)
    .resize({ width: ANALYSIS_SIZE, height: ANALYSIS_SIZE, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const original = await sharp(input).metadata();
  const scale = original.width / w;

  // Background: the median colour of a band around the edge.
  const band = Math.max(3, Math.round(Math.min(w, h) * 0.03));
  const border = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= band && x < w - band && y >= band && y < h - band) continue;
      const i = (y * w + x) * 3;
      border.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const median = (values) => values.sort((a, b) => a - b)[values.length >> 1];
  const bg = [0, 1, 2].map((c) => median(border.map((p) => p[c])));
  const distance = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
  const spread = median(border.map((p) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2])));
  const threshold = Math.max(30, spread * 3.5);

  // Mask of book pixels, smoothed with a small box filter to drop specks and fill pinholes.
  const raw = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) raw[p] = distance(p * 3) > threshold ? 1 : 0;
  const mask = boxSmooth(raw, w, h, 2);

  // Biggest connected patch.
  const label = new Int32Array(w * h).fill(-1);
  let best = { id: -1, size: 0 };
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] !== -1) continue;
    let size = 0;
    stack.push(start);
    label[start] = start;
    while (stack.length) {
      const p = stack.pop();
      size += 1;
      const x = p % w;
      for (const q of [p - w, p + w, x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1]) {
        if (q >= 0 && q < w * h && mask[q] && label[q] === -1) {
          label[q] = start;
          stack.push(q);
        }
      }
    }
    if (size > best.size) best = { id: start, size };
  }
  if (best.size < w * h * 0.02) throw new Error('could not find the book. Shoot it on a plain background that contrasts with it.');
  if (best.size > w * h * 0.97) throw new Error('the book fills the whole photo. Leave a margin of background around it.');

  // Edge pixels of the patch.
  const edge = [];
  for (let p = 0; p < w * h; p++) {
    if (label[p] !== best.id) continue;
    const x = p % w;
    const y = (p / w) | 0;
    const inside = (q, ok) => ok && label[q] === best.id;
    if (!inside(p - 1, x > 0) || !inside(p + 1, x < w - 1) || !inside(p - w, y > 0) || !inside(p + w, y < h - 1)) {
      edge.push([x + 0.5, y + 0.5]);
    }
  }

  // Rough corners from the extremes along the diagonals, then a line per side.
  const pick = (score) => edge.reduce((a, b) => (score(b) > score(a) ? b : a));
  const rough = [
    pick(([x, y]) => -(x + y)),
    pick(([x, y]) => x - y),
    pick(([x, y]) => x + y),
    pick(([x, y]) => y - x),
  ];
  const lines = rough.map((a, i) => fitSide(edge, a, rough[(i + 1) % 4]));
  let corners = lines.map((line, i) => intersect(lines[(i + 3) % 4], line));
  if (corners.some((c) => !c) || !plausible(corners, best.size)) {
    corners = rough;
    notes.push('the outline was irregular, so the crop may be loose. Run with --debug to check it.');
  }

  const found = corners.map(([x, y]) => [x * scale, y * scale]);
  if (flags.has('--debug')) await drawDebug(input, found, key);
  return found;
}

/** Box-filter a 0/1 mask and threshold it at half. */
function boxSmooth(mask, w, h, r) {
  const sum = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x];
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const y0 = Math.max(0, y - r);
      const x1 = Math.min(w, x + r + 1);
      const y1 = Math.min(h, y + r + 1);
      const total = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
      out[y * w + x] = total * 2 > (x1 - x0) * (y1 - y0) ? 1 : 0;
    }
  }
  return out;
}

/** Least-squares line through the edge pixels along the middle of one side. */
function fitSide(edge, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const tolerance = Math.max(4, length * 0.04);
  const points = edge.filter(([x, y]) => {
    const t = ((x - a[0]) * dx + (y - a[1]) * dy) / (length * length);
    const off = Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / length;
    return t > 0.12 && t < 0.88 && off < tolerance;
  });
  if (points.length < 6) return { point: a, direction: [dx / length, dy / length] };
  return fitLine(points);
}

function intersect(l1, l2) {
  const [x1, y1] = l1.point;
  const [dx1, dy1] = l1.direction;
  const [x2, y2] = l2.point;
  const [dx2, dy2] = l2.direction;
  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / det;
  return [x1 + t * dx1, y1 + t * dy1];
}

/** The fitted outline should be convex and cover about as much as the patch does. */
function plausible(corners, patchArea) {
  let area = 0;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const [cx, cy] = corners[(i + 2) % 4];
    area += ax * by - bx * ay;
    const cross = Math.sign((bx - ax) * (cy - by) - (by - ay) * (cx - bx));
    if (sign && cross !== sign) return false;
    sign = cross;
  }
  const ratio = Math.abs(area / 2) / patchArea;
  return ratio > 0.85 && ratio < 1.2;
}

/**
 * Move each side of a rough outline onto the strongest edge running alongside it:
 * sample points along the side, look across it for the sharpest change in
 * brightness, fit a line through those points and intersect neighbouring sides.
 */
async function snapCorners(input, rough, notes, within = 0.025) {
  const { data, info } = await sharp(input)
    .resize({ width: 1400, height: 1400, fit: 'inside' })
    .greyscale()
    .blur(1.2)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const scale = w / (await sharp(input).metadata()).width;
  const at = (x, y) => {
    const x0 = Math.min(Math.max(Math.floor(x), 0), w - 2);
    const y0 = Math.min(Math.max(Math.floor(y), 0), h - 2);
    const fx = x - x0;
    const fy = y - y0;
    const i = y0 * w + x0;
    return (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + w] * (1 - fx) + data[i + w + 1] * fx) * fy;
  };
  const corners = rough.map(([x, y]) => [x * scale, y * scale]);
  const reach = Math.max(6, Math.max(w, h) * within);
  const lines = corners.map((a, i) => {
    const b = corners[(i + 1) % 4];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    const points = [];
    for (let k = 0; k <= 60; k++) {
      const t = 0.08 + (0.84 * k) / 60;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      let best = { score: 0, s: 0 };
      for (let s = -reach; s <= reach; s += 0.5) {
        const g = Math.abs(at(p[0] + n[0] * (s + 1), p[1] + n[1] * (s + 1)) - at(p[0] + n[0] * (s - 1), p[1] + n[1] * (s - 1)));
        // Prefer edges near where the side was placed.
        const score = g * Math.exp(-((s / reach) ** 2) * 0.7);
        if (score > best.score) best = { score, s };
      }
      if (best.score > 6) points.push([p[0] + n[0] * best.s, p[1] + n[1] * best.s]);
    }
    if (points.length < 10) return null;
    let line = fitLine(points);
    // Refit without the points that landed on some other edge.
    const off = points.map((q) => Math.abs((q[0] - line.point[0]) * line.direction[1] - (q[1] - line.point[1]) * line.direction[0]));
    const limit = Math.max(1.5, 2.5 * [...off].sort((x, y) => x - y)[off.length >> 1]);
    const kept = points.filter((_, j) => off[j] <= limit);
    if (kept.length >= 8) line = fitLine(kept);
    return line;
  });
  if (lines.some((line) => !line)) {
    notes.push('some sides had no clear edge to snap to, so the typed corners were used as they are.');
    return rough;
  }
  const snapped = lines.map((line, i) => intersect(lines[(i + 3) % 4], line));
  const moved = snapped.map((c, i) => (c ? Math.hypot(c[0] - corners[i][0], c[1] - corners[i][1]) : Infinity));
  if (moved.some((d) => d > reach * 2)) {
    notes.push('a snapped corner moved too far from where it was typed, so the typed corners were used as they are.');
    return rough;
  }
  return snapped.map(([x, y]) => [x / scale, y / scale]);
}

/** Pull sides of the outline inward by a fraction of the book's size, e.g. { right: 0.02 }. */
function trim([tl, tr, br, bl], { top = 0, right = 0, bottom = 0, left = 0 }) {
  const toward = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  [tl, tr] = [toward(tl, tr, left), toward(tr, tl, right)];
  [bl, br] = [toward(bl, br, left), toward(br, bl, right)];
  [tl, bl] = [toward(tl, bl, top), toward(bl, tl, bottom)];
  [tr, br] = [toward(tr, br, top), toward(br, tr, bottom)];
  return [tl, tr, br, bl];
}

function fitLine(points) {
  const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p[1], 0) / points.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { point: [mx, my], direction: [Math.cos(angle), Math.sin(angle)] };
}

/**
 * Map the four corners onto a flat rectangle at the photo's own resolution. The
 * proportions come from the outline's sides unless the book's are known (`ratio`,
 * width over height as it stands): a photo taken at an angle shortens one side.
 */
async function warp(input, corners, ratio) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [tl, tr, br, bl] = corners;
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let width = Math.round((len(tl, tr) + len(bl, br)) / 2);
  let height = Math.round((len(tl, bl) + len(tr, br)) / 2);
  if (ratio) {
    // Keep the longer side, the one the angle shortens least, and set the other from the ratio.
    if (height >= width) width = Math.round(height * ratio);
    else height = Math.round(width * ratio);
  }
  // Trim a hair off every side so no background shows along the edges.
  const inset = Math.max(1, Math.round(Math.min(width, height) * 0.006));
  const outW = width - inset * 2;
  const outH = height - inset * 2;
  const H = homography(
    [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ],
    corners,
  );
  const out = Buffer.alloc(outW * outH * 3);
  const { width: sw, height: sh } = info;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const u = x + inset + 0.5;
      const v = y + inset + 0.5;
      const d = H[6] * u + H[7] * v + 1;
      const sx = (H[0] * u + H[1] * v + H[2]) / d - 0.5;
      const sy = (H[3] * u + H[4] * v + H[5]) / d - 0.5;
      const x0 = Math.min(Math.max(Math.floor(sx), 0), sw - 2);
      const y0 = Math.min(Math.max(Math.floor(sy), 0), sh - 2);
      const fx = Math.min(Math.max(sx - x0, 0), 1);
      const fy = Math.min(Math.max(sy - y0, 0), 1);
      const i00 = (y0 * sw + x0) * 3;
      const i10 = i00 + 3;
      const i01 = i00 + sw * 3;
      const i11 = i01 + 3;
      const o = (y * outW + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
        const bottom = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
        out[o + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return sharp(out, { raw: { width: outW, height: outH, channels: 3 } })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

/** The 3×3 projective transform (h33 = 1) taking each `from` point to its `to` point. */
function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let row = col + 1; row < 8; row++) {
      const f = A[row][col] / A[col][col];
      for (let k = col; k < 8; k++) A[row][k] -= f * A[col][k];
      b[row] -= f * b[col];
    }
  }
  const h = new Array(8).fill(0);
  for (let row = 7; row >= 0; row--) {
    let s = b[row];
    for (let k = row + 1; k < 8; k++) s -= A[row][k] * h[k];
    h[row] = s / A[row][row];
  }
  return h;
}

/** The photo with the outline drawn on it, in the photo's own pixels. */
async function drawDebug(input, corners, key) {
  const { width: w, height: h } = await sharp(input).metadata();
  const stroke = Math.max(2, Math.round(Math.max(w, h) / 400));
  const points = corners.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="${points}" fill="none" stroke="#ff00aa" stroke-width="${stroke}"/></svg>`;
  const dir = path.join(folder, 'debug');
  await mkdir(dir, { recursive: true });
  // sharp resizes before it composites, so draw first and shrink second.
  const drawn = await sharp(input).composite([{ input: Buffer.from(svg) }]).png({ compressionLevel: 1 }).toBuffer();
  await sharp(drawn).resize({ width: 1200, height: 1200, fit: 'inside' }).png().toFile(path.join(dir, `${key}.png`));
}

function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
}

function listMissing() {
  const order = { shelf: 0, ordered: 1, read: 2, wishlist: 3 };
  const heading = { shelf: 'On the shelf', ordered: 'On order', read: 'Read, not kept', wishlist: 'Wishlist' };
  const missing = books
    .filter((book) => !book.spineImage || !book.backImage)
    .sort((a, b) => order[a.status] - order[b.status] || a.title.localeCompare(b.title, 'en', { numeric: true }));
  let status = '';
  for (const book of missing) {
    if (book.status !== status) {
      status = book.status;
      console.log(`\n${heading[status]}`);
    }
    const needs = [!book.spineImage && 'spine', !book.backImage && 'back'].filter(Boolean).join(' + ');
    console.log(`  ${book.id.padEnd(8)} ${needs.padEnd(12)} ${book.title}`);
  }
  console.log(`\n${missing.length} of ${books.length} books still need a photo.`);
}
