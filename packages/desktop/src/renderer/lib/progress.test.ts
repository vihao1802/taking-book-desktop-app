import { describe, expect, it } from 'vitest';
import type { BookFile } from '@taking-book/core';
import { progressLine } from './progress';

function book(lastPage: number | null, pageCount: number | null): BookFile {
  return {
    id: 1,
    hash: 'h1',
    path: '/store/h1',
    title: 'Book 1',
    status: 'reading',
    tags: [],
    favorite: false,
    lastPage,
    lastPosition: 0,
    lastMode: 'page',
    pageCount,
    zoom: null,
    reflowZoom: null,
    lastReadAt: 1,
    createdAt: '2026-01-01 00:00:00',
  };
}

describe('progressLine', () => {
  it('shows the page, the page count and the percent read', () => {
    expect(progressLine(book(45, 320))).toBe('Page 45 of 320 · 14%');
  });

  it('shows only the page while the page count is unknown', () => {
    expect(progressLine(book(45, null))).toBe('Page 45');
  });

  it('is null for a Book that was never read', () => {
    expect(progressLine(book(null, 320))).toBeNull();
  });
});
