import { describe, expect, it } from 'vitest';
import { buildNoteAnchor } from './note-anchor';

const selection = { page: 2, start: 10, end: 21, quote: 'brown fox' };

describe('buildNoteAnchor', () => {
  it('keeps the page anchor and finds the quote in a paragraph of the same page', () => {
    const paragraphs = [
      { pageIndex: 0, text: 'The quick brown fox' },
      { pageIndex: 1, text: 'A lazy dog' },
      { pageIndex: 1, text: 'Jumped over the brown fox.' },
    ];
    expect(buildNoteAnchor(paragraphs, selection)).toEqual({
      page: 2,
      pageStart: 10,
      pageEnd: 21,
      quote: 'brown fox',
      paraIndex: 2,
      paraStart: 16,
      paraEnd: 25,
    });
  });

  it('matches the quote ignoring whitespace differences between page and reflow text', () => {
    const anchor = buildNoteAnchor([{ pageIndex: 1, text: 'the brown   fox ran' }], selection);
    expect(anchor.paraIndex).toBe(0);
  });

  it('leaves the paragraph fields null when no paragraph on the page holds the quote', () => {
    const anchor = buildNoteAnchor([{ pageIndex: 0, text: 'a brown fox' }], selection);
    expect(anchor).toMatchObject({ page: 2, paraIndex: null, paraStart: null, paraEnd: null });
  });

  it('leaves the paragraph fields null before any reflow text exists', () => {
    expect(buildNoteAnchor([], selection).paraIndex).toBeNull();
  });
});
