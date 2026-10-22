// Packs an LDraw model and every part it uses into one gzipped file that
// three.js's LDrawLoader can read without the parts library.
//
// Usage: node scripts/pack-ldraw.mjs <ldraw library folder> <model.mpd> <out.mpd.gz> [more part folders...]
//
// The library is the official parts library (library.ldraw.org, complete.zip).
// Parts not in it yet, such as ones still on the Parts Tracker, can come from
// more folders laid out the same way (parts/, parts/s/, p/); the library is searched first.
// Part and model files keep their own Author and !LICENSE header lines.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const [libraryDir, modelPath, outPath, ...extraDirs] = process.argv.slice(2);
if (!libraryDir || !modelPath || !outPath) {
  console.error('Usage: node scripts/pack-ldraw.mjs <ldraw library folder> <model.mpd> <out.mpd.gz> [more part folders...]');
  process.exit(1);
}

/** The name LDrawLoader will look an embedded file up by (it lower-cases both sides). */
function loaderName(reference) {
  const name = reference.replace(/\\/g, '/');
  if (/^s\//i.test(name)) return `parts/${name}`;
  if (/^48\//i.test(name)) return `p/${name}`;
  return name;
}

/** Where a referenced file lives in the library, if it does. */
function libraryFile(reference) {
  const name = reference.replace(/\\/g, '/');
  const candidates = [libraryDir, ...extraDirs].flatMap((dir) => [
    path.join(dir, 'parts', name),
    path.join(dir, 'p', name),
    path.join(dir, 'models', name),
  ]);
  return candidates.find((file) => existsSync(file)) ?? null;
}

const referencePattern = /^\s*1\s+\S+(?:\s+\S+){12}\s+(.+?)\s*$/;
const references = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => referencePattern.exec(line)?.[1])
    .filter(Boolean);

// Rename the model's own sub-files the way the loader looks them up, so a
// model-specific subpart such as "s\10262 - 92582s01.dat" is found as "parts/s/...".
const model = (await readFile(modelPath, 'utf8'))
  .replace(/\r\n/g, '\n')
  .replace(/^0 FILE (.+)$/gm, (_, name) => `0 FILE ${loaderName(name.trim())}`);

// Names of the model's own sub-files, so they are not looked up as parts.
const ownFiles = new Set(
  [...model.matchAll(/^0 FILE (.+)$/gm)].map((match) => match[1].trim().toLowerCase()),
);
const mainName = [...model.matchAll(/^0 FILE (.+)$/gm)][0]?.[1].trim();
if (!mainName) throw new Error('Expected an .mpd file that starts with 0 FILE');

const packed = new Map();
const missing = new Set();
const queue = references(model);

while (queue.length) {
  const reference = queue.shift();
  const key = loaderName(reference).toLowerCase();
  if (ownFiles.has(key) || packed.has(key) || missing.has(key)) continue;
  const file = libraryFile(reference);
  if (!file) {
    missing.add(key);
    continue;
  }
  const text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n').trimEnd();
  packed.set(key, { name: loaderName(reference), text });
  queue.push(...references(text));
}

// Colours first, then a reference to the main model, then every file it needs.
// LDrawLoader treats any "0 FILE" after the first line as an embedded file.
const config = (await readFile(path.join(libraryDir, 'LDConfig.ldr'), 'utf8'))
  .split(/\r?\n/)
  .filter((line) => line.startsWith('0 !COLOUR'))
  .join('\n');

const parts = [...packed.values()].map(({ name, text }) => `0 FILE ${name}\n${text}\n0 NOFILE`);
const output = [
  '0 Packed for gerald-ikem-site: model, parts and LDConfig colours in one file',
  config,
  `1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${mainName}`,
  model.trimEnd(),
  ...parts,
  '',
].join('\n');

await mkdir(path.dirname(outPath), { recursive: true });
const gz = gzipSync(output, { level: 9 });
await writeFile(outPath, gz);
console.log(
  `${path.basename(modelPath)}: ${packed.size} library files, ${(output.length / 1e6).toFixed(1)} MB text, ` +
    `${(gz.length / 1e6).toFixed(2)} MB gzipped.` +
    (missing.size ? ` Missing (${missing.size}): ${[...missing].slice(0, 12).join(', ')}` : ''),
);
