import { describe, expect, it } from 'vitest';
import type { BookFile, BookStatus } from '../src';
import { arrangeHome, isBeingRead } from '../src';

interface BookOptions {
  status: BookStatus;
  lastReadAt?: number | null;
  /** Day of January 2026 the Book was added; later days are newer. */
  addedOn: number;
}

function book(id: number, options: BookOptions): BookFile {
  const day = String(options.addedOn).padStart(2, '0');
  return {
    id,
    hash: `h${id}`,
    path: `/${id}.pdf`,
    title: `Book ${id}`,
    status: options.status,
    tags: [],
    favorite: false,
    lastPage: null,
    lastPosition: null,
    lastMode: 'page',
    pageCount: null,
    zoom: null,
    reflowZoom: null,
    lastReadAt: options.lastReadAt ?? null,
    createdAt: `2026-01-${day} 00:00:00`,
  };
}

function ids(files: BookFile[]): number[] {
  return files.map((f) => f.id);
}

describe('arrangeHome', () => {
  it('features the only reading Book as continue and leaves Reading now empty', () => {
    const home = arrangeHome([
      book(1, { status: 'reading', lastReadAt: 100, addedOn: 1 }),
      book(2, { status: 'unread', addedOn: 2 }),
    ]);
    expect(home.featured).toEqual({ kind: 'continue', book: expect.objectContaining({ id: 1 }) });
    expect(home.readingNow).toEqual([]);
    expect(ids(home.recentlyAdded)).toEqual([2]);
  });

  it('features the most recently read Book and lists the other reading Books by recency', () => {
    const home = arrangeHome([
      book(1, { status: 'reading', lastReadAt: 200, addedOn: 1 }),
      book(2, { status: 'reading', lastReadAt: 300, addedOn: 2 }),
      book(3, { status: 'reading', lastReadAt: 100, addedOn: 3 }),
      book(4, { status: 'reading', lastReadAt: null, addedOn: 4 }),
    ]);
    expect(home.featured?.book.id).toBe(2);
    expect(ids(home.readingNow)).toEqual([1, 3, 4]);
    expect(home.recentlyAdded).toEqual([]);
  });

  it('counts an opened "To read" Book as being read, since opening never changes status', () => {
    const home = arrangeHome([
      book(1, { status: 'unread', lastReadAt: 100, addedOn: 1 }),
      book(2, { status: 'unread', addedOn: 2 }),
    ]);
    expect(home.featured).toEqual({ kind: 'continue', book: expect.objectContaining({ id: 1 }) });
  });

  it('never features a finished Book as continue, even if it was read most recently', () => {
    const home = arrangeHome([
      book(1, { status: 'finished', lastReadAt: 900, addedOn: 1 }),
      book(2, { status: 'reading', lastReadAt: 100, addedOn: 2 }),
    ]);
    expect(home.featured?.book.id).toBe(2);
    expect(ids(home.readingNow)).toEqual([]);
  });

  it('offers the newest "To read" Book as start when nothing is being read', () => {
    const home = arrangeHome([
      book(1, { status: 'unread', addedOn: 1 }),
      book(2, { status: 'unread', addedOn: 3 }),
      book(3, { status: 'unread', addedOn: 2 }),
    ]);
    expect(home.featured).toEqual({ kind: 'start', book: expect.objectContaining({ id: 2 }) });
    expect(home.readingNow).toEqual([]);
    expect(ids(home.recentlyAdded)).toEqual([3, 1]);
  });

  it('has no featured Book when every Book is finished', () => {
    const home = arrangeHome([
      book(1, { status: 'finished', lastReadAt: 100, addedOn: 1 }),
      book(2, { status: 'finished', addedOn: 2 }),
    ]);
    expect(home.featured).toBeNull();
    expect(home.readingNow).toEqual([]);
    expect(ids(home.recentlyAdded)).toEqual([2, 1]);
  });

  it('arranges an empty library as nothing at all', () => {
    expect(arrangeHome([])).toEqual({ featured: null, readingNow: [], recentlyAdded: [] });
  });

  it('fills Recently added with the newest Books not shown above, up to four', () => {
    const home = arrangeHome([
      book(1, { status: 'reading', lastReadAt: 500, addedOn: 7 }),
      book(2, { status: 'reading', lastReadAt: 400, addedOn: 6 }),
      book(3, { status: 'finished', addedOn: 5 }),
      book(4, { status: 'unread', addedOn: 4 }),
      book(5, { status: 'unread', addedOn: 3 }),
      book(6, { status: 'finished', addedOn: 2 }),
      book(7, { status: 'unread', addedOn: 1 }),
    ]);
    expect(ids(home.recentlyAdded)).toEqual([3, 4, 5, 6]);
  });

  it('orders Recently added by date added, whatever order the Books arrive in', () => {
    const home = arrangeHome([
      book(1, { status: 'finished', addedOn: 1 }),
      book(2, { status: 'finished', addedOn: 3 }),
      book(3, { status: 'finished', addedOn: 2 }),
    ]);
    expect(ids(home.recentlyAdded)).toEqual([2, 3, 1]);
  });

  it('shows a reading Book that is also the newest added only once', () => {
    const home = arrangeHome([
      book(1, { status: 'reading', lastReadAt: 100, addedOn: 9 }),
      book(2, { status: 'unread', addedOn: 1 }),
    ]);
    const shown = [home.featured?.book.id, ...ids(home.readingNow), ...ids(home.recentlyAdded)];
    expect(shown).toEqual([1, 2]);
  });

  it('does not repeat the start Book in Recently added', () => {
    const home = arrangeHome([book(1, { status: 'unread', addedOn: 1 })]);
    expect(home.featured?.kind).toBe('start');
    expect(home.recentlyAdded).toEqual([]);
  });
});

describe('isBeingRead', () => {
  it('is true for reading Books and opened "To read" Books, false otherwise', () => {
    expect(isBeingRead(book(1, { status: 'reading', addedOn: 1 }))).toBe(true);
    expect(isBeingRead(book(2, { status: 'unread', lastReadAt: 5, addedOn: 1 }))).toBe(true);
    expect(isBeingRead(book(3, { status: 'unread', addedOn: 1 }))).toBe(false);
    expect(isBeingRead(book(4, { status: 'finished', lastReadAt: 5, addedOn: 1 }))).toBe(false);
  });
});
