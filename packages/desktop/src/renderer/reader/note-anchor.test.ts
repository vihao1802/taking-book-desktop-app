import { describe, expect, it } from 'vitest';
import type { Annotation } from '@taking-book/core';
import { buildNoteAnchor, fillReflowAnchors } from './note-anchor';

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

function annotation(overrides: Partial<Annotation>): Annotation {
  return {
    id: 1,
    uid: 'uid-1',
    fileHash: 'h1',
    page: 2,
    pageStart: 10,
    pageEnd: 21,
    quote: 'brown fox',
    color: 'yellow',
    note: null,
    paraIndex: null,
    paraStart: null,
    paraEnd: null,
    createdAt: '',
    updatedAt: 0,
    updatedBy: '',
    ...overrides,
  };
}

describe('fillReflowAnchors', () => {
  const paragraphs = [
    { pageIndex: 0, text: 'The quick brown fox' },
    { pageIndex: 1, text: 'Jumped over the brown fox.' },
  ];

  it('anchors a page-view annotation in the paragraph holding its quote', () => {
    const { annotations, filled } = fillReflowAnchors([annotation({})], paragraphs);
    expect(annotations[0]).toMatchObject({ paraIndex: 1, paraStart: 16, paraEnd: 25 });
    expect(filled).toEqual(annotations);
  });

  it('leaves alone an annotation that already has an anchor, a Page note, and a quote nothing matches', () => {
    const anchored = annotation({ id: 1, paraIndex: 0, paraStart: 0, paraEnd: 3 });
    const pageNote = annotation({ id: 2, quote: '', pageStart: null, pageEnd: null, note: 'about this page' });
    const unmatched = annotation({ id: 3, quote: 'not in the book' });
    const { annotations, filled } = fillReflowAnchors([anchored, pageNote, unmatched], paragraphs);
    expect(annotations).toEqual([anchored, pageNote, unmatched]);
    expect(filled).toEqual([]);
  });

  it('changes nothing before any reflow text exists', () => {
    const { annotations, filled } = fillReflowAnchors([annotation({})], []);
    expect(annotations[0].paraIndex).toBeNull();
    expect(filled).toEqual([]);
  });
});
