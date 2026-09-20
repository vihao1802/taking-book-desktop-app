import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  filesSchema,
  hasNoteText,
  isOk,
  listAnnotations,
  listNotes,
  upsertFile,
} from '../src';
import type { Annotation, CreateAnnotationInput } from '../src';
import { createAnnotation, createMemoryDriver } from './helpers';

function input(overrides: Partial<CreateAnnotationInput> = {}): CreateAnnotationInput {
  return {
    page: 1,
    pageStart: 0,
    pageEnd: 5,
    quote: 'quoted',
    color: 'yellow',
    note: null,
    paraIndex: null,
    paraStart: null,
    paraEnd: null,
    ...overrides,
  };
}

/** Stores the given annotations for one book and returns its live annotation list. */
async function storeAnnotations(inputs: CreateAnnotationInput[]): Promise<Annotation[]> {
  const db = createMemoryDriver();
  await db.exec(`${filesSchema()} ${annotationsSchema()}`);
  await upsertFile(db, { filePath: '/a.pdf', hash: 'h1', title: 'A' });
  for (const one of inputs) {
    const created = await createAnnotation(db, 'h1', one);
    expect(isOk(created)).toBe(true);
  }
  const listed = await listAnnotations(db, 'h1');
  if (!isOk(listed)) throw new Error(listed.error);
  return listed.data;
}

describe('hasNoteText', () => {
  it('is true only for annotations with non-blank note text', async () => {
    const stored = await storeAnnotations([
      input({ note: 'a thought' }),
      input({ note: '  \n ' }),
      input({ note: null }),
    ]);

    expect(stored.map(hasNoteText)).toEqual([true, false, false]);
  });
});

describe('listNotes', () => {
  it('lists only annotations that carry note text by default', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'plain highlight' }),
      input({ quote: 'with note', note: 'my thought' }),
    ]);

    const notes = listNotes(stored);

    expect(notes.map((n) => n.quote)).toEqual(['with note']);
  });

  it('treats blank note text as no note', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'blank', note: '   ' }),
      input({ quote: 'empty', note: '' }),
    ]);

    expect(listNotes(stored)).toEqual([]);
  });

  it('also lists highlights without text when asked', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'plain highlight' }),
      input({ quote: 'with note', note: 'my thought' }),
    ]);

    const notes = listNotes(stored, { includeHighlights: true });

    expect(notes.map((n) => n.quote).sort()).toEqual(['plain highlight', 'with note']);
  });

  it('orders by page, then by position within the page', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'p3', page: 3, pageStart: 5, note: 'x' }),
      input({ quote: 'p2 late', page: 2, pageStart: 400, note: 'x' }),
      input({ quote: 'p2 early', page: 2, pageStart: 10, note: 'x' }),
      input({ quote: 'p1', page: 1, pageStart: 900, note: 'x' }),
    ]);

    const notes = listNotes(stored);

    expect(notes.map((n) => n.quote)).toEqual(['p1', 'p2 early', 'p2 late', 'p3']);
  });

  it('keeps creation order for notes at the same position', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'first', page: 4, pageStart: 7, note: 'x' }),
      input({ quote: 'second', page: 4, pageStart: 7, note: 'x' }),
    ]);

    expect(listNotes(stored).map((n) => n.quote)).toEqual(['first', 'second']);
  });

  it('puts notes with no page-text anchor ahead of anchored ones on the same page', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'anchored', page: 2, pageStart: 0, pageEnd: 4, note: 'x' }),
      input({ quote: '', page: 2, pageStart: null, pageEnd: null, note: 'about the whole page' }),
    ]);

    expect(listNotes(stored).map((n) => n.note)).toEqual(['about the whole page', 'x']);
  });

  it('orders reflow-only anchors on a page by paragraph position', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'later', page: 2, pageStart: null, pageEnd: null, paraIndex: 9, paraStart: 0, paraEnd: 3, note: 'x' }),
      input({ quote: 'sooner', page: 2, pageStart: null, pageEnd: null, paraIndex: 4, paraStart: 12, paraEnd: 20, note: 'x' }),
    ]);

    expect(listNotes(stored).map((n) => n.quote)).toEqual(['sooner', 'later']);
  });

  it('returns an empty list for a book without annotations', () => {
    expect(listNotes([])).toEqual([]);
    expect(listNotes([], { includeHighlights: true })).toEqual([]);
  });

  it('does not reorder or modify the list it was given', async () => {
    const stored = await storeAnnotations([
      input({ quote: 'b', page: 2, note: 'x' }),
      input({ quote: 'a', page: 1, note: 'x' }),
    ]);
    const before = stored.map((n) => n.quote);

    listNotes(stored);

    expect(stored.map((n) => n.quote)).toEqual(before);
  });
});
