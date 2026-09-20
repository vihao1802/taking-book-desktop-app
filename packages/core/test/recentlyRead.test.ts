import { describe, expect, it } from 'vitest';
import type { BookFile } from '../src';
import { sortByRecentlyRead } from '../src';

function book(id: number, lastReadAt: number | null): BookFile {
  return {
    id,
    hash: `h${id}`,
    path: `/${id}.pdf`,
    title: `Book ${id}`,
    status: 'reading',
    tags: [],
    favorite: false,
    lastPage: null,
    lastPosition: null,
    lastMode: 'page',
    pageCount: null,
    zoom: null,
    reflowZoom: null,
    lastReadAt,
    createdAt: '2026-01-01 00:00:00',
  };
}

describe('sortByRecentlyRead', () => {
  it('puts the most recently read book first', () => {
    const sorted = sortByRecentlyRead([book(1, 100), book(2, 300), book(3, 200)]);
    expect(sorted.map((f) => f.id)).toEqual([2, 3, 1]);
  });

  it('sinks never-read books to the end, keeping their incoming order', () => {
    const sorted = sortByRecentlyRead([book(1, null), book(2, 50), book(3, null)]);
    expect(sorted.map((f) => f.id)).toEqual([2, 1, 3]);
  });

  it('does not mutate the input', () => {
    const input = [book(1, 1), book(2, 2)];
    sortByRecentlyRead(input);
    expect(input.map((f) => f.id)).toEqual([1, 2]);
  });
});
