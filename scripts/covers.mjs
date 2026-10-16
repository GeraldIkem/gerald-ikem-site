// Fetches each comic's front cover from the URL in the CLZ export, saves a small
// WebP to public/covers/, and records the cover's proportions and main colour in
// src/data/comics.json so the shelf can draw the spine in the book's own colour.
// Back covers come along too when the export has them (backUrl: CLZ only exports
// them after "Update from Core" with back covers switched on); they go to public/backs/.
//
// Usage: node scripts/covers.mjs [--from <folder of already-downloaded covers>] [--force]
//
// Covers are the publishers' artwork, shown here only to picture books I own.

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(root, 'src', 'data', 'comics.json');
const outDir = path.join(root, 'public', 'covers');
const backDir = path.join(root, 'public', 'backs');
const sourcesPath = path.join(root, 'src', 'data', 'comic-image-sources.json');
const args = process.argv.slice(2);
const fromDir = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
const force = args.includes('--force');

const WIDTH = 520;
const SIGNATURES = [
  [0xff, 0xd8, 0xff], // JPEG
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0x52, 0x49, 0x46, 0x46], // WebP (RIFF)
];

const isImage = (buffer) => SIGNATURES.some((sig) => sig.every((byte, i) => buffer[i] === byte));
const exists = (file) => access(file).then(() => true, () => false);
const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

async function source(book, url = book.coverUrl) {
  if (fromDir && url === book.coverUrl) {
    const local = path.join(fromDir, `${book.id}.img`);
    if (await exists(local)) return readFile(local);
  }
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const books = JSON.parse(await readFile(dataPath, 'utf8'));
await mkdir(outDir, { recursive: true });

let done = 0;
const failed = [];
for (const book of books) {
  if (!book.coverUrl) continue;
  const file = path.join(outDir, `${book.id}.webp`);
  if (!force && book.cover && (await exists(file))) continue;
  try {
    const raw = await source(book);
    if (!isImage(raw)) throw new Error('not an image');
    const image = sharp(raw).rotate();
    const { width, height } = await image.metadata();
    await image.clone().resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toFile(file);
    // The left edge sits next to the spine on a real book, so it picks the spine colour.
    const edge = await sharp(raw)
      .extract({ left: 0, top: 0, width: Math.max(Math.round(width * 0.12), 1), height })
      .stats();
    book.cover = `/covers/${book.id}.webp`;
    book.coverColor = hex(edge.dominant);
    book.coverRatio = Math.round((width / height) * 1000) / 1000;
    done += 1;
  } catch (error) {
    failed.push(`${book.title}: ${error.message}`);
  }
}

// Back covers from CLZ Core. A photo or scan already in place (scripts/spines.mjs) wins.
const sources = (await exists(sourcesPath)) ? JSON.parse(await readFile(sourcesPath, 'utf8')) : {};
let backs = 0;
for (const book of books) {
  if (!book.backUrl) continue;
  const fromCore = sources[book.id]?.back?.source === 'CLZ Core';
  if (book.backImage && !(fromCore && force)) continue;
  try {
    const raw = await source(book, book.backUrl);
    if (!isImage(raw)) throw new Error('not an image');
    await mkdir(backDir, { recursive: true });
    await sharp(raw)
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(path.join(backDir, `${book.id}.webp`));
    book.backImage = `/backs/${book.id}.webp`;
    sources[book.id] = { ...sources[book.id], back: { source: 'CLZ Core', url: book.backUrl } };
    backs += 1;
  } catch (error) {
    failed.push(`${book.title} (back): ${error.message}`);
  }
}
if (backs) await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`, 'utf8');

await writeFile(dataPath, `${JSON.stringify(books, null, 2)}\n`, 'utf8');
console.log(`Processed ${done} covers into public/covers/${backs ? ` and ${backs} back covers into public/backs/` : ''}.`);
if (failed.length) console.log(`Failed:\n  ${failed.join('\n  ')}`);
