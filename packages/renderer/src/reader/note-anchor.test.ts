import { describe, expect, it } from 'vitest';
import type { Annotation } from '@taking-book/core';
import { buildNoteAnchor, fillReflowAnchors, findPageAnchor, findReflowSegments } from './note-anchor';

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
    const { annotations, filled, extraSegments } = fillReflowAnchors([annotation({})], paragraphs);
    expect(annotations[0]).toMatchObject({ paraIndex: 1, paraStart: 16, paraEnd: 25 });
    expect(filled).toEqual(annotations);
    expect(extraSegments).toEqual([]);
  });

  it('leaves alone an annotation that already has an anchor, a Page note, and a quote nothing matches', () => {
    const anchored = annotation({ id: 1, paraIndex: 0, paraStart: 0, paraEnd: 3 });
    const pageNote = annotation({ id: 2, quote: '', pageStart: null, pageEnd: null, note: 'about this page' });
    const unmatched = annotation({ id: 3, quote: 'not in the book' });
    const { annotations, filled, extraSegments } = fillReflowAnchors([anchored, pageNote, unmatched], paragraphs);
    expect(annotations).toEqual([anchored, pageNote, unmatched]);
    expect(filled).toEqual([]);
    expect(extraSegments).toEqual([]);
  });

  it('changes nothing before any reflow text exists', () => {
    const { annotations, filled } = fillReflowAnchors([annotation({})], []);
    expect(annotations[0].paraIndex).toBeNull();
    expect(filled).toEqual([]);
  });
});

describe('findReflowSegments', () => {
  const paragraphs = [
    { pageIndex: 1, text: 'First paragraph ends here.' },
    { pageIndex: 1, text: 'A whole middle paragraph.' },
    { pageIndex: 1, text: 'Last one starts here, then goes on.' },
    { pageIndex: 2, text: 'Another page.' },
  ];

  it('returns one segment when a single paragraph holds the quote', () => {
    expect(findReflowSegments(paragraphs, { page: 2, quote: 'middle paragraph' })).toEqual([
      { paraIndex: 1, paraStart: 8, paraEnd: 24 },
    ]);
  });

  it('splits a quote that runs across paragraphs into one segment per paragraph', () => {
    const quote = 'ends here.\nA whole middle paragraph.\nLast one starts';
    expect(findReflowSegments(paragraphs, { page: 2, quote })).toEqual([
      { paraIndex: 0, paraStart: 16, paraEnd: 26 },
      { paraIndex: 1, paraStart: 0, paraEnd: 25 },
      { paraIndex: 2, paraStart: 0, paraEnd: 15 },
    ]);
  });

  it('does not look across a page boundary', () => {
    expect(findReflowSegments(paragraphs, { page: 2, quote: 'goes on. Another page.' })).toEqual([]);
  });

  it('finds nothing for a quote that is not on the page', () => {
    expect(findReflowSegments(paragraphs, { page: 2, quote: 'not in the book' })).toEqual([]);
  });
});

describe('fillReflowAnchors across paragraphs', () => {
  const paragraphs = [
    { pageIndex: 1, text: 'First paragraph ends here.' },
    { pageIndex: 1, text: 'Last one starts here.' },
  ];
  const spanning = annotation({ quote: 'ends here.\nLast one', page: 2 });

  it('anchors the annotation in its first paragraph and hands the rest over as extra segments', () => {
    const { annotations, filled, extraSegments } = fillReflowAnchors([spanning], paragraphs);
    expect(annotations[0]).toMatchObject({ id: spanning.id, paraIndex: 0, paraStart: 16, paraEnd: 26 });
    expect(extraSegments).toEqual([expect.objectContaining({ id: spanning.id, paraIndex: 1, paraStart: 0, paraEnd: 8 })]);
    // Saving only the first piece as the anchor would make the highlight look shorter than it is.
    expect(filled).toEqual([]);
  });
});

describe('findPageAnchor', () => {
  it('finds the quote in the page text ignoring whitespace differences', () => {
    expect(findPageAnchor('The quick  brown fox jumps', 'brown\nfox')).toEqual({ pageStart: 11, pageEnd: 20 });
  });

  it('returns null when the page text does not hold the quote', () => {
    expect(findPageAnchor('The quick brown fox', 'lazy dog')).toBeNull();
  });
});
