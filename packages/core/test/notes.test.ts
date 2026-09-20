import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  filesSchema,
  hasNoteText,
  isOk,
  listAnnotations,
  listFiles,
  listLibraryAnnotations,
  listLibraryNotes,
  listNotes,
  saveLastPosition,
  upsertFile,
} from '../src';
import type { Annotation, BookFile, CreateAnnotationInput } from '../src';
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

interface LibraryBookSeed {
  hash: string;
  title: string;
  /** Epoch ms the book was last read; omitted for a book that was never opened. */
  lastReadAt?: number;
  annotations: CreateAnnotationInput[];
}

/** Builds a library of the given books with their annotations and returns what the Notes view is fed. */
async function seedLibrary(
  seeds: LibraryBookSeed[],
): Promise<{ files: BookFile[]; annotations: Annotation[] }> {
  const db = createMemoryDriver();
  await db.exec(`${filesSchema()} ${annotationsSchema()}`);
  for (const seed of seeds) {
    await upsertFile(db, { filePath: `/${seed.hash}.pdf`, hash: seed.hash, title: seed.title });
    if (seed.lastReadAt !== undefined) {
      const row = await db.get('SELECT id FROM files WHERE hash = ?', [seed.hash]);
      await saveLastPosition(db, Number(row?.id), { page: 1, position: 0, mode: 'page' }, { updatedAt: seed.lastReadAt, updatedBy: 'dev' });
    }
    for (const one of seed.annotations) {
      expect(isOk(await createAnnotation(db, seed.hash, one))).toBe(true);
    }
  }
  const files = await listFiles(db);
  const annotations = await listLibraryAnnotations(db);
  if (!isOk(files) || !isOk(annotations)) throw new Error('could not read the seeded library');
  return { files: files.data, annotations: annotations.data };
}

describe('listLibraryNotes', () => {
  it('groups Notes by book, most recently read book first, each in page order', async () => {
    const { files, annotations } = await seedLibrary([
      { hash: 'old', title: 'Old Book', lastReadAt: 1_000, annotations: [input({ quote: 'old p1', page: 1, note: 'x' })] },
      {
        hash: 'new',
        title: 'New Book',
        lastReadAt: 9_000,
        annotations: [
          input({ quote: 'new p5', page: 5, note: 'x' }),
          input({ quote: 'new p2', page: 2, note: 'x' }),
        ],
      },
      { hash: 'never', title: 'Never Opened', annotations: [input({ quote: 'never p1', note: 'x' })] },
    ]);

    const groups = listLibraryNotes(files, annotations);

    expect(groups.map((group) => group.file.title)).toEqual(['New Book', 'Old Book', 'Never Opened']);
    expect(groups.map((group) => group.notes.map((n) => n.quote))).toEqual([['new p2', 'new p5'], ['old p1'], ['never p1']]);
  });

  it('searches the quoted passage, the note text and the book title, ignoring case', async () => {
    const { files, annotations } = await seedLibrary([
      {
        hash: 'a',
        title: 'Moby Dick',
        lastReadAt: 2_000,
        annotations: [
          input({ quote: 'Call me ISHMAEL', page: 1, note: 'opening line' }),
          input({ quote: 'the whale', page: 2, note: 'Ishmael again' }),
          input({ quote: 'unrelated', page: 3, note: 'nothing here' }),
        ],
      },
      { hash: 'b', title: 'Ishmael Speaks', lastReadAt: 1_000, annotations: [input({ quote: 'other', note: 'plain' })] },
      { hash: 'c', title: 'Other Book', annotations: [input({ quote: 'nope', note: 'nada' })] },
    ]);

    const groups = listLibraryNotes(files, annotations, { query: 'ishmael' });

    expect(groups.map((group) => [group.file.title, group.notes.map((n) => n.quote)])).toEqual([
      ['Moby Dick', ['Call me ISHMAEL', 'the whale']],
      ['Ishmael Speaks', ['other']],
    ]);
  });

  it('lists everything when the search box is empty or only whitespace', async () => {
    const { files, annotations } = await seedLibrary([
      { hash: 'a', title: 'A', annotations: [input({ note: 'one' })] },
      { hash: 'b', title: 'B', annotations: [input({ note: 'two' })] },
    ]);

    expect(listLibraryNotes(files, annotations, { query: '' })).toHaveLength(2);
    expect(listLibraryNotes(files, annotations, { query: '   ' })).toHaveLength(2);
  });

  it('returns nothing when the search matches nothing', async () => {
    const { files, annotations } = await seedLibrary([{ hash: 'a', title: 'A', annotations: [input({ note: 'one' })] }]);

    expect(listLibraryNotes(files, annotations, { query: 'zzz' })).toEqual([]);
  });

  it('lists highlights without text only when asked, and a book with only highlights then appears', async () => {
    const { files, annotations } = await seedLibrary([
      { hash: 'a', title: 'A', lastReadAt: 2_000, annotations: [input({ quote: 'marked', page: 1 }), input({ quote: 'written', page: 2, note: 'x' })] },
      { hash: 'b', title: 'B', lastReadAt: 1_000, annotations: [input({ quote: 'only marked' })] },
    ]);

    const byDefault = listLibraryNotes(files, annotations);
    const withHighlights = listLibraryNotes(files, annotations, { includeHighlights: true });

    expect(byDefault.map((group) => group.notes.map((n) => n.quote))).toEqual([['written']]);
    expect(withHighlights.map((group) => group.notes.map((n) => n.quote))).toEqual([['marked', 'written'], ['only marked']]);
  });

  it('applies the search to highlights too when they are included', async () => {
    const { files, annotations } = await seedLibrary([
      { hash: 'a', title: 'A', annotations: [input({ quote: 'Needle in text', page: 1 }), input({ quote: 'hay', page: 2 })] },
    ]);

    const groups = listLibraryNotes(files, annotations, { includeHighlights: true, query: 'needle' });

    expect(groups.map((group) => group.notes.map((n) => n.quote))).toEqual([['Needle in text']]);
  });

  it('ignores annotations of books that are not in the library', async () => {
    const { files, annotations } = await seedLibrary([
      { hash: 'kept', title: 'Kept', annotations: [input({ note: 'stays' })] },
      { hash: 'gone', title: 'Gone', annotations: [input({ note: 'orphaned' })] },
    ]);

    const groups = listLibraryNotes(files.filter((file) => file.hash === 'kept'), annotations);

    expect(groups.map((group) => group.file.title)).toEqual(['Kept']);
  });

  it('keeps every Note of a book whose title matches the search', async () => {
    const { files, annotations } = await seedLibrary([
      { hash: 'a', title: 'Moby Dick', annotations: [input({ quote: 'first', page: 1, note: 'x' }), input({ quote: 'second', page: 2, note: 'y' })] },
    ]);

    const groups = listLibraryNotes(files, annotations, { query: 'MOBY' });

    expect(groups.map((group) => group.notes.map((n) => n.quote))).toEqual([['first', 'second']]);
  });
});
