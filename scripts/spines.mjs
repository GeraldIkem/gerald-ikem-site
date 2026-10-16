// Turns photos of my books' spines and back covers into the images the shelf and
// the 3D book use. Each photo is named by the book's id from src/data/comics.json:
//
//   photos/1143890-spine.jpg   photos/1143890-back.jpg
//
// The script finds the book against the background, straightens it (rotation and
// perspective), crops it, writes public/spines/<id>.webp and public/backs/<id>.webp,
// and fills in spineImage, spineRatio and backImage. docs/spine-photos.md has the
// shooting guide.
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
// the back. "scan": true skips detection for that image. "source" and "url" record
// where an image came from in src/data/comic-image-sources.json.

import { mkdir, readFile, readdir, writeFile, access } from 'node:fs/promises';
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
    const result = await processPhoto(path.join(folder, file), kind, fix, key, ratio);
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
async function processPhoto(file, kind, fix, key, ratio) {
  const notes = [];
  let input = await sharp(await readFile(file))
    .rotate()
    .png({ compressionLevel: 1 })
    .toBuffer();
  if (fix.crop) {
    const [left, top, width, height] = fix.crop.map(Math.round);
    input = await sharp(input).extract({ left, top, width, height }).png({ compressionLevel: 1 }).toBuffer();
  }

  let flat = input;
  if (!fix.scan && !flags.has('--scan')) {
    let corners = fix.corners ?? (await findCorners(input, notes, key));
    // Corners typed in by hand only need to be close: each side snaps to the edge beside it.
    if (fix.corners && fix.snap !== false) corners = await snapCorners(input, corners, notes);
    if (fix.trim) corners = trim(corners, fix.trim);
    if (flags.has('--debug') && fix.corners) await drawDebug(input, corners, key);
    flat = await warp(input, corners, ratio);
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
  return {
    image: sharp(flat).resize({ ...out, fit: 'fill', kernel: 'lanczos3' }),
    width: out.width,
    height: out.height,
    notes,
  };
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
async function snapCorners(input, rough, notes) {
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
  const reach = Math.max(6, Math.max(w, h) * 0.025);
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
