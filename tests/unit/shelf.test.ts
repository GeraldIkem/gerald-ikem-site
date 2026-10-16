import { describe, expect, it } from 'vitest';
import comics from '../../src/data/comics.json';
import { countBy, describe as describeBook, hash, shelfOrder, spineStyle, type Book } from '~/lib/shelf';

const book = (overrides: Partial<Book>): Book => ({
  id: '1',
  title: 'Batman: Hush',
  publisher: 'DC Comics',
  format: 'Omnibus',
  size: 'omnibus',
  status: 'shelf',
  pages: null,
  year: 2022,
  note: '',
  ...overrides,
});

describe('spineStyle', () => {
  it('is stable for the same title', () => {
    expect(spineStyle(book({}))).toEqual(spineStyle(book({})));
    expect(hash('a')).not.toBe(hash('b'));
  });

  it('uses page counts for thick books and ignores tiny ones', () => {
    expect(spineStyle(book({ pages: 1000 })).width).toBe(3.4);
    expect(spineStyle(book({ pages: 32, size: 'trade' })).width).toBe(1.05);
    expect(spineStyle(book({ pages: 5000 })).width).toBe(4.3);
  });

  it('colours DC and Marvel from different families', () => {
    const hue = (style: { color: string }) => Number(style.color.split(' ').at(-1)?.replace(')', ''));
    const dc = hue(spineStyle(book({ publisher: 'DC Comics' })));
    const marvel = hue(spineStyle(book({ publisher: 'Marvel Comics' })));
    expect(dc).toBeGreaterThanOrEqual(228);
    expect(dc).toBeLessThanOrEqual(262);
    expect(marvel >= 350 || marvel <= 25).toBe(true);
  });
});

describe('shelf order', () => {
  it('keeps a run together in volume order', () => {
    const titles = [
      book({ title: 'Green Lantern Omnibus Vol. 10' }),
      book({ title: 'Green Lantern Omnibus Vol. 2' }),
      book({ title: 'Aquaman Omnibus', publisher: 'Marvel Comics' }),
    ]
      .sort(shelfOrder)
      .map((b) => b.title);
    expect(titles).toEqual(['Green Lantern Omnibus Vol. 2', 'Green Lantern Omnibus Vol. 10', 'Aquaman Omnibus']);
  });
});

describe('describe', () => {
  it('reads like a catalogue line', () => {
    expect(describeBook(book({ pages: 1118 }))).toBe('Omnibus, DC, 2022. 1,118 pages');
  });
});

describe('the exported collection', () => {
  const books = comics as Book[];

  it('has unique ids and titles for every book', () => {
    expect(new Set(books.map((b) => b.id)).size).toBe(books.length);
    expect(books.every((b) => b.title.trim().length > 0)).toBe(true);
  });

  it('counts every status', () => {
    const counts = countBy(books);
    expect(counts.shelf + counts.ordered + counts.wishlist + counts.read).toBe(books.length);
  });
});
