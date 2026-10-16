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
}

export function spineStyle(book: Pick<Book, 'title' | 'publisher' | 'size' | 'pages'>): SpineStyle {
  const seed = hash(book.title);
  const [from, to] = HUES[book.publisher] ?? OTHER_HUES;
  const hue = (from + (seed % (to - from + 1))) % 360;
  const lightness = 0.34 + ((seed >>> 8) % 15) / 100;
  const chroma = 0.07 + ((seed >>> 16) % 8) / 100;

  // Real page counts look odd for short floppies, so only trust them for thick books.
  const fromPages = book.pages && book.pages >= 120 ? (book.pages / 1000) * 3.4 : null;
  const width = Math.min(Math.max(fromPages ?? THICKNESS[book.size], 0.95), 4.3);

  return {
    height: HEIGHT[book.size],
    width: Math.round(width * 100) / 100,
    color: `oklch(${lightness.toFixed(2)} ${chroma.toFixed(2)} ${hue})`,
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
