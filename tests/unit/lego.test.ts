import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { legoSets, modelCredit, modelled, type LegoSet, type ScanModel } from '~/data/lego';

const publicFile = (url: string) => fileURLToPath(new URL(`../../public${url}`, import.meta.url));

/** The name LDrawLoader looks a file up by, as scripts/pack-ldraw.mjs names them. */
function loaderName(reference: string): string {
  const name = reference.replace(/\\/g, '/').toLowerCase();
  if (name.startsWith('s/')) return `parts/${name}`;
  if (name.startsWith('48/')) return `p/${name}`;
  return name;
}

const references = (text: string) => [...text.matchAll(/^\s*1\s+\S+(?:\s+\S+){12}\s+(.+?)\s*$/gm)].map((match) => match[1]!);

describe('LEGO sets', () => {
  it('gives every set its own official number', () => {
    const numbers = legoSets.map((set) => set.number);
    expect(numbers.every((number) => /^\d{4,6}$/.test(number ?? ''))).toBe(true);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('ships every model it points to', () => {
    for (const { model } of modelled) {
      expect(model.url).toMatch(model.kind === 'scan' ? /^\/lego\/.+\.glb$/ : /^\/lego\/.+\.mpd\.gz$/);
      expect(existsSync(publicFile(model.url)), model.url).toBe(true);
    }
  });

  it('only has scans of sets I have built', () => {
    expect(modelled.filter((set) => set.model.kind === 'scan' && !set.built)).toEqual([]);
  });

  it('packs every file an LDraw model refers to', () => {
    for (const { model } of modelled.filter((set) => set.model.kind === 'ldraw')) {
      const text = gunzipSync(readFileSync(publicFile(model.url))).toString('utf8');
      const files = new Set([...text.matchAll(/^0 FILE (.+)$/gm)].map((match) => loaderName(match[1]!.trim())));
      const missing = new Set(references(text).map(loaderName).filter((name) => !files.has(name)));
      expect([...missing], model.url).toEqual([]);
    }
  });
});

describe('my Astro Bot model', () => {
  const packed = gunzipSync(readFileSync(publicFile('/lego/40899.mpd.gz'))).toString('utf8');
  // The model's own files are the .ldr ones; the rest of the pack is LDraw parts.
  const files = new Map(
    packed
      .split(/^0 NOFILE$/m)
      .map((block) => /^\s*0 FILE (.+\.ldr)$/m.exec(block))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => [match[1]!.trim(), match.input.slice(match.index)]),
  );
  const source = [...files.values()].join('\n');

  /** Every part in the finished model, with sub-models opened up, as "part colour". */
  function parts(file: string, colour: string): string[] {
    return [...files.get(file)!.matchAll(/^1 (\d+)(?: \S+){12} (.+)$/gm)].flatMap(([, own, name]) => {
      const inherited = own === '16' ? colour : own!;
      return files.has(name!) ? parts(name!, inherited) : [`${name} ${inherited}`];
    });
  }

  it('has all 275 parts of the set, without its sticker sheet', () => {
    const all = parts('40899.ldr', '16');
    expect(all).toHaveLength(275);
    // The blue logo tile stands in for the printed one, and the trans-light-blue windscreen is the jetpack.
    expect(all.filter((part) => part === '26603.dat 1')).toHaveLength(1);
    expect(all.filter((part) => part === '92474.dat 43')).toHaveLength(1);
  });

  it('has a step for every numbered step in the booklet', () => {
    const labelled = new Set<number>();
    for (const [, first, last] of source.matchAll(/^0 \/\/ Steps? (\d+)(?: (?:to|and) (\d+))?/gm)) {
      for (let step = Number(first); step <= Number(last ?? first); step++) labelled.add(step);
    }
    expect([...labelled].sort((a, b) => a - b)).toEqual(Array.from({ length: 95 }, (_, i) => i + 1));
  });
});

describe('modelCredit', () => {
  it('credits an LDraw model to its author, source and licence', () => {
    const mustang = modelled.find((set) => set.number === '10265')!;
    expect(modelCredit(mustang)).toBe(
      '3D model of set 10265 by Ulrich Röder, LDraw.org Official Model Repository, CC BY 2.0.',
    );
  });

  it('credits my own model of the Astro Bot to me, with its licence', () => {
    const astroBot = modelled.find((set) => set.number === '40899')!;
    expect(modelCredit(astroBot)).toBe(
      '3D model of set 40899 by Gerald Ikem, modelled step by step from the LEGO building instructions, CC BY 4.0.',
    );
  });

  it('says plainly that a scan is of my own build and has no steps', () => {
    const scan: LegoSet & { model: ScanModel } = {
      name: 'Astro Bot',
      number: '40899',
      built: true,
      color: '#f4f4f4',
      text: '#0055bf',
      model: { kind: 'scan', url: '/lego/40899.glb', app: 'KIRI Engine' },
    };
    expect(modelCredit(scan)).toBe(
      'A 3D scan of my own build of set 40899, made with KIRI Engine. A scan shows the finished set, so it has no building steps.',
    );
  });
});
