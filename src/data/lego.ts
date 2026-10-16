export interface LegoSet {
  name: string;
  built: boolean;
  /** Brick colour, from the LEGO palette, picked to suit the set. */
  color: string;
  /** Text colour that reads on that brick. */
  text: string;
  note?: string;
}

// LEGO colour names: light bluish grey, bright red, black, bright blue, white,
// reddish brown, sand blue, orange, dark bluish grey, dark purple.
export const legoSets: LegoSet[] = [
  { name: 'James Bond Aston Martin DB5', built: true, color: '#a0a5a9', text: '#05131d', note: 'The James Bond one' },
  { name: 'Steamboat', built: true, color: '#c91a09', text: '#ffffff' },
  { name: 'Batmobile (1966)', built: true, color: '#05131d', text: '#ffffff', note: 'From the classic TV series' },
  { name: 'Ford Mustang', built: true, color: '#0055bf', text: '#ffffff' },
  { name: 'Astro Bot', built: true, color: '#f4f4f4', text: '#0055bf' },
  { name: 'Sherlock Holmes book nook', built: true, color: '#582a12', text: '#ffffff', note: 'The one that sits in a bookcase' },
  { name: 'PlayStation', built: false, color: '#6074a1', text: '#ffffff' },
  { name: 'One Piece: the Baratie', built: false, color: '#fe8a18', text: '#05131d', note: 'The floating restaurant' },
  { name: 'The Black Pearl', built: false, color: '#05131d', text: '#ffffff', note: 'Jack Sparrow’s ship' },
  { name: 'Classic Batmobile', built: false, color: '#6c6e68', text: '#ffffff', note: 'A long one, with a lot of pieces' },
  { name: 'Arkham Asylum', built: false, color: '#3f3691', text: '#ffffff' },
];
