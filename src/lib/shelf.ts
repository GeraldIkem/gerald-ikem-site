export type Size = 'omnibus' | 'absolute' | 'deluxe' | 'hardcover' | 'trade';
export type Status = 'shelf' | 'ordered' | 'read' | 'wishlist';

export interface Book {
  id: string;
  title: string;
  publisher: string;
  format: string;
  size: Size;
  status: Status;
  pages: number | null;
  year: number | null;
  note: string;
  coverUrl?: string | null;
  /** Local WebP of the front cover, written by scripts/covers.mjs. */
  cover?: string;
  /** Main colour along the cover's left edge, used for the spine. */
  coverColor?: string;
  /** Cover width divided by height. */
  coverRatio?: number;
}

/** Spine heights in rem, roughly in proportion to the real formats. */
const HEIGHT: Record<Size, number> = {
  absolute: 15,
  omnibus: 14,
  deluxe: 12.75,
  hardcover: 12,
  trade: 10.5,
};

/** Spine thickness in rem when the page count is unknown. */
const THICKNESS: Record<Size, number> = {
  omnibus: 3,
  absolute: 2.3,
  deluxe: 1.55,
  hardcover: 1.45,
  trade: 1.05,
};

/** Small deterministic hash, so a book keeps its colour between builds. */
export function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Comic-print families: DC in cyans and blues, Marvel in magentas and reds. */
const HUES: Record<string, [number, number]> = {
  'DC Comics': [228, 262],
  'Marvel Comics': [350, 385],
  'Image Comics': [70, 95],
};
const OTHER_HUES: [number, number] = [35, 60];

export interface SpineStyle {
  height: number;
  width: number;
  color: string;
  /** Text colour that reads on `color`. */
  text: string;
}

/** Black or white, whichever reads better on a hex colour (WCAG relative luminance). */
export function readableOn(hexColor: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hexColor);
  if (!match?.[1]) return '#ffffff';
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(match[1]!.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  return luminance > 0.36 ? '#15181c' : '#ffffff';
}

export function spineStyle(
  book: Pick<Book, 'title' | 'publisher' | 'size' | 'pages'> & { coverColor?: string | undefined },
): SpineStyle {
  const seed = hash(book.title);
  const [from, to] = HUES[book.publisher] ?? OTHER_HUES;
  const hue = (from + (seed % (to - from + 1))) % 360;
  const lightness = 0.34 + ((seed >>> 8) % 15) / 100;
  const chroma = 0.07 + ((seed >>> 16) % 8) / 100;

  // Real page counts look odd for short floppies, so only trust them for thick books.
  const fromPages = book.pages && book.pages >= 120 ? (book.pages / 1000) * 3.4 : null;
  const width = Math.min(Math.max(fromPages ?? THICKNESS[book.size], 0.95), 4.3);

  // A real cover's edge colour wins over the publisher family colour.
  if (book.coverColor) {
    return {
      height: HEIGHT[book.size],
      width: Math.round(width * 100) / 100,
      color: book.coverColor,
      text: readableOn(book.coverColor),
    };
  }

  return {
    height: HEIGHT[book.size],
    width: Math.round(width * 100) / 100,
    color: `oklch(${lightness.toFixed(2)} ${chroma.toFixed(2)} ${hue})`,
    text: '#ffffff',
  };
}

export const STATUS_LABEL: Record<Status, string> = {
  shelf: 'On the shelf',
  ordered: 'On order',
  wishlist: 'Wishlist',
  read: 'Read, not kept',
};

export function describe(book: Book): string {
  const parts = [book.format, book.publisher.replace(' Comics', ''), book.year ? String(book.year) : null];
  const pages = book.pages && book.pages >= 120 ? `${book.pages.toLocaleString('en-CA')} pages` : null;
  return [parts.filter(Boolean).join(', '), pages].filter(Boolean).join('. ');
}

export function countBy(books: Book[]): Record<Status, number> {
  const counts: Record<Status, number> = { shelf: 0, ordered: 0, wishlist: 0, read: 0 };
  for (const book of books) counts[book.status] += 1;
  return counts;
}

const PUBLISHER_ORDER = ['DC Comics', 'Marvel Comics', 'Image Comics'];

/**
 * Shelf order: by publisher, then by title, so the volumes of a run stand
 * together. Ordered and wishlist books sit in the gap they will fill.
 */
export function shelfOrder(a: Book, b: Book): number {
  const rank = (book: Book) => {
    const index = PUBLISHER_ORDER.indexOf(book.publisher);
    return index === -1 ? PUBLISHER_ORDER.length : index;
  };
  return rank(a) - rank(b) || a.title.localeCompare(b.title, 'en', { numeric: true, sensitivity: 'base' });
}

export interface SpineLabel {
  /** The title as it would be printed on the spine. */
  label: string;
  /** Volume number for multi-volume runs. */
  volume: number | null;
}

const WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

/** Strip the edition words a spine prints elsewhere, and pull out the volume. */
export function spineLabel(title: string): SpineLabel {
  let volume: number | null = null;
  const numbered = /\bVol(?:ume)?\.?\s*(\d+)\b/i.exec(title);
  const worded = /\bBook\s+(One|Two|Three|Four)\b/i.exec(title);
  if (numbered?.[1]) volume = Number(numbered[1]);
  else if (worded?.[1]) volume = WORD_NUMBERS[worded[1].toLowerCase()] ?? null;

  const label = title
    .replace(/\s*\bVol(?:ume)?\.?\s*\d+\b/gi, '')
    .replace(/\s*[—-]\s*Book\s+(One|Two|Three|Four)\b/gi, '')
    .replace(/\s*[—-]\s*(The\s+)?(Deluxe|Absolute)\s+Edition\b/gi, '')
    .replace(/:\s*The\s+Absolute\s+Edition\b/gi, '')
    .replace(/\s+Omnibus\b/gi, '')
    .replace(/\s+-\s+Deluxe Edition\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { label: label || title, volume };
}

/** The short publisher name printed at the foot of a spine. */
export function publisherMark(publisher: string): string {
  if (publisher === 'DC Comics') return 'DC';
  if (publisher === 'Marvel Comics') return 'Marvel';
  return publisher.replace(/\s+Comics$/, '');
}
