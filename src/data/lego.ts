/** An exact LDraw model of the set, packed by scripts/pack-ldraw.mjs. It builds in the order of the real instructions. */
export interface LdrawModel {
  kind: 'ldraw';
  url: string;
  author: string;
  source: string;
  license: string;
}

/** A 3D scan of my own finished build, as binary glTF. A scan has no building steps, so it's shown whole. */
export interface ScanModel {
  kind: 'scan';
  url: string;
  /** The app that made the scan. */
  app: string;
  /** Degrees to turn the scan about the vertical so its front faces the camera. */
  turn?: number;
}

export type LegoModel = LdrawModel | ScanModel;

export interface LegoSet {
  name: string;
  /** Official set number, where I know which version I have. */
  number?: string;
  built: boolean;
  /** Brick colour, from the LEGO palette, picked to suit the set. */
  color: string;
  /** Text colour that reads on that brick. */
  text: string;
  note?: string;
  /** An exact digital model of the set when one is freely available, or else a scan of my own build. */
  model?: LegoModel;
}

const omr = (url: string, author: string): LdrawModel => ({
  kind: 'ldraw',
  url,
  author,
  source: 'LDraw.org Official Model Repository',
  license: 'CC BY 2.0',
});

// LEGO colour names: light bluish grey, bright red, black, bright blue, white,
// reddish brown, sand blue, orange, dark bluish grey, dark purple.
export const legoSets: LegoSet[] = [
  {
    name: 'James Bond Aston Martin DB5',
    number: '10262',
    built: true,
    color: '#a0a5a9',
    text: '#05131d',
    note: 'The James Bond one',
    model: omr('/lego/10262.mpd.gz', 'Orion Pobursky'),
  },
  { name: 'River Steamboat', number: '21356', built: true, color: '#c91a09', text: '#ffffff' },
  { name: 'Batmobile (1966)', number: '76328', built: true, color: '#05131d', text: '#ffffff', note: 'From the classic TV series' },
  {
    name: 'Ford Mustang',
    number: '10265',
    built: true,
    color: '#0055bf',
    text: '#ffffff',
    model: omr('/lego/10265.mpd.gz', 'Ulrich Röder'),
  },
  {
    name: 'Astro Bot',
    number: '40899',
    built: true,
    color: '#f4f4f4',
    text: '#0055bf',
    // My own model. LDraw has no printed logo tile or stickers for it, so those are traced and drawn on plain parts.
    model: {
      kind: 'ldraw',
      url: '/lego/40899.mpd.gz',
      author: 'Gerald Ikem',
      source: 'modelled step by step from the LEGO building instructions',
      license: 'CC BY 4.0',
    },
  },
  { name: 'Sherlock Holmes book nook', number: '10351', built: true, color: '#582a12', text: '#ffffff', note: 'The one that sits in a bookcase' },
  { name: 'PlayStation', number: '72306', built: false, color: '#6074a1', text: '#ffffff' },
  { name: 'One Piece: the Baratie', number: '75640', built: false, color: '#fe8a18', text: '#05131d', note: 'The floating restaurant' },
  { name: 'The Black Pearl', number: '10365', built: false, color: '#05131d', text: '#ffffff', note: 'Jack Sparrow’s ship' },
  {
    name: '1989 Batmobile',
    number: '76139',
    built: false,
    color: '#6c6e68',
    text: '#ffffff',
    note: 'A long one, with a lot of pieces',
    model: omr('/lego/76139.mpd.gz', 'Orion Pobursky'),
  },
  { name: 'Arkham Asylum', number: '76300', built: false, color: '#3f3691', text: '#ffffff' },
];

export const modelled = legoSets.filter((set): set is LegoSet & { model: LegoModel } => Boolean(set.model));

/** The line under the viewer that says where a model came from. */
export function modelCredit(set: LegoSet & { model: LegoModel }): string {
  const { model } = set;
  if (model.kind === 'scan') {
    return `A 3D scan of my own build of set ${set.number}, made with ${model.app}. A scan shows the finished set, so it has no building steps.`;
  }
  return `3D model of set ${set.number} by ${model.author}, ${model.source}, ${model.license}.`;
}
