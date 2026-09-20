import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  applyRecordAnnotations,
  createAnnotation,
  deleteAnnotation,
  deleteNote,
  filesSchema,
  getAnnotation,
  isOk,
  isPageNote,
  listAnnotations,
  listAnnotationsForSync,
  listNotes,
  saveNoteDraft,
  saveNoteText,
  savePageNote,
  setAnnotationColor,
  upsertFile,
} from '../src';
import type { NoteDraft, SqlDriver } from '../src';
import { createMemoryDriver, sequentialUids } from './helpers';

function draft(overrides: Partial<NoteDraft> = {}): NoteDraft {
  return {
    page: 3,
    pageStart: 10,
    pageEnd: 24,
    quote: 'selected words',
    color: 'yellow',
    text: 'my thought',
    paraIndex: null,
    paraStart: null,
    paraEnd: null,
    ...overrides,
  };
}

async function dbWithBook(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await db.exec(`${filesSchema()} ${annotationsSchema()}`);
  await upsertFile(db, { filePath: '/a.pdf', hash: 'h1', title: 'A' });
  return db;
}

async function save(db: SqlDriver, note: NoteDraft) {
  return saveNoteDraft(db, 'h1', note, { generateUid: sequentialUids('dev-a') });
}

async function liveAnnotations(db: SqlDriver) {
  const listed = await listAnnotations(db, 'h1');
  if (!isOk(listed)) throw new Error(listed.error);
  return listed.data;
}

describe('saveNoteDraft', () => {
  it('stores the quote, color and text of the draft as a Note', async () => {
    const db = await dbWithBook();

    const saved = await save(db, draft({ color: 'blue', text: 'a thought\nover two lines' }));

    expect(isOk(saved)).toBe(true);
    const stored = await liveAnnotations(db);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      quote: 'selected words',
      color: 'blue',
      note: 'a thought\nover two lines',
    });
    expect(listNotes(stored).map((note) => note.note)).toEqual(['a thought\nover two lines']);
  });

  it('keeps the page-text anchor of a note written in page mode', async () => {
    const db = await dbWithBook();

    await save(db, draft({ page: 7, pageStart: 100, pageEnd: 120 }));

    expect((await liveAnnotations(db))[0]).toMatchObject({
      page: 7,
      pageStart: 100,
      pageEnd: 120,
      paraIndex: null,
      paraStart: null,
      paraEnd: null,
    });
  });

  it('keeps the paragraph anchor of a note written in reflow mode', async () => {
    const db = await dbWithBook();

    await save(db, draft({ pageStart: null, pageEnd: null, paraIndex: 42, paraStart: 5, paraEnd: 19 }));

    expect((await liveAnnotations(db))[0]).toMatchObject({
      pageStart: null,
      pageEnd: null,
      paraIndex: 42,
      paraStart: 5,
      paraEnd: 19,
    });
  });

  it('keeps both anchors when the passage was located in both reader modes', async () => {
    const db = await dbWithBook();

    await save(db, draft({ pageStart: 10, pageEnd: 24, paraIndex: 8, paraStart: 0, paraEnd: 14 }));

    expect((await liveAnnotations(db))[0]).toMatchObject({
      pageStart: 10,
      pageEnd: 24,
      paraIndex: 8,
      paraStart: 0,
      paraEnd: 14,
    });
  });

  it('trims the text so stray blank lines around a note are not stored', async () => {
    const db = await dbWithBook();

    await save(db, draft({ text: '\n  padded thought \n\n' }));

    expect((await liveAnnotations(db))[0].note).toBe('padded thought');
  });

  it('saves empty text as a plain Highlight that keeps its quote and color', async () => {
    const db = await dbWithBook();

    const saved = await save(db, draft({ color: 'pink', text: '' }));

    expect(isOk(saved)).toBe(true);
    const stored = await liveAnnotations(db);
    expect(stored[0]).toMatchObject({ quote: 'selected words', color: 'pink', note: null });
    expect(listNotes(stored)).toEqual([]);
    expect(listNotes(stored, { includeHighlights: true })).toHaveLength(1);
  });

  it('treats whitespace-only text as empty', async () => {
    const db = await dbWithBook();

    await save(db, draft({ text: ' \n\t ' }));

    expect((await liveAnnotations(db))[0].note).toBeNull();
  });

  it('rejects a draft with no quoted passage and stores nothing', async () => {
    const db = await dbWithBook();

    const saved = await save(db, draft({ quote: '  ' }));

    expect(isOk(saved)).toBe(false);
    expect(await liveAnnotations(db)).toEqual([]);
  });

  it('rejects an unknown color and stores nothing', async () => {
    const db = await dbWithBook();

    // A color the type system forbids, as could arrive over IPC.
    const saved = await save(db, draft({ color: 'purple' as NoteDraft['color'] }));

    expect(isOk(saved)).toBe(false);
    expect(await liveAnnotations(db)).toEqual([]);
  });

  it('gives the saved Note the uid and sync clock the caller supplied', async () => {
    const db = await dbWithBook();

    const saved = await saveNoteDraft(db, 'h1', draft(), {
      generateUid: sequentialUids('dev-a'),
      stamp: { updatedAt: 555, updatedBy: 'dev-a' },
    });

    expect(isOk(saved)).toBe(true);
    const synced = await listAnnotationsForSync(db, 'h1');
    if (!isOk(synced)) throw new Error(synced.error);
    expect(synced.data).toHaveLength(1);
    expect(synced.data[0]).toMatchObject({ uid: 'dev-a-1', updatedAt: 555, updatedBy: 'dev-a' });
  });
});

async function addAnnotation(db: SqlDriver, overrides: Partial<NoteDraft> & { note?: string | null } = {}) {
  const { text: _text, note = null, ...anchor } = { ...draft(), ...overrides };
  const created = await createAnnotation(
    db,
    'h1',
    { ...anchor, note },
    { generateUid: sequentialUids('dev-a'), stamp: { updatedAt: 100, updatedBy: 'dev-a' } },
  );
  if (!isOk(created)) throw new Error(created.error);
  return created.data;
}

const EDIT_STAMP = { updatedAt: 200, updatedBy: 'dev-b' };

describe('savePageNote', () => {
  async function savePage(db: SqlDriver, page: number, text: string) {
    return savePageNote(db, 'h1', { page, text }, { generateUid: sequentialUids('dev-a') });
  }

  it('stores the text on the page with no quoted passage and no anchors', async () => {
    const db = await dbWithBook();

    const saved = await savePage(db, 5, 'about this page');

    expect(isOk(saved)).toBe(true);
    const stored = await liveAnnotations(db);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      page: 5,
      quote: '',
      note: 'about this page',
      pageStart: null,
      pageEnd: null,
      paraIndex: null,
      paraStart: null,
      paraEnd: null,
    });
    expect(isPageNote(stored[0])).toBe(true);
    expect(listNotes(stored).map((note) => note.note)).toEqual(['about this page']);
  });

  it('trims the text but keeps inner line breaks', async () => {
    const db = await dbWithBook();

    await savePage(db, 1, '\n  first line\nsecond line \n');

    expect((await liveAnnotations(db))[0].note).toBe('first line\nsecond line');
  });

  it.each(['', '   ', '\n \t\n'])('does not save empty text (%j)', async (text) => {
    const db = await dbWithBook();

    const saved = await savePage(db, 2, text);

    expect(isOk(saved)).toBe(false);
    expect(await liveAnnotations(db)).toEqual([]);
  });

  it('allows several Page notes on one page and lists them in the order they were written', async () => {
    const db = await dbWithBook();

    await savePage(db, 4, 'first');
    await savePage(db, 4, 'second');
    await savePage(db, 3, 'earlier page');

    expect(listNotes(await liveAnnotations(db)).map((note) => note.note)).toEqual(['earlier page', 'first', 'second']);
  });

  it('lists a Page note ahead of a Note on a passage of the same page', async () => {
    const db = await dbWithBook();
    await save(db, draft({ page: 4, text: 'about a passage' }));

    await savePage(db, 4, 'about the page');

    expect(listNotes(await liveAnnotations(db)).map((note) => note.note)).toEqual(['about the page', 'about a passage']);
  });

  it('stamps the write with the given sync clock', async () => {
    const db = await dbWithBook();

    await savePageNote(
      db,
      'h1',
      { page: 1, text: 'stamped' },
      { generateUid: sequentialUids('dev-a'), stamp: { updatedAt: 500, updatedBy: 'dev-a' } },
    );

    const synced = await listAnnotationsForSync(db, 'h1');
    if (!isOk(synced)) throw new Error(synced.error);
    expect(synced.data[0]).toMatchObject({ quote: '', note: 'stamped', updatedAt: 500, updatedBy: 'dev-a', deleted: false });
  });

  it('reaches another device through sync and is matched by its uid there', async () => {
    const db = await dbWithBook();
    await savePage(db, 6, 'shared thought');
    const synced = await listAnnotationsForSync(db, 'h1');
    if (!isOk(synced)) throw new Error(synced.error);
    const other = await dbWithBook();

    await applyRecordAnnotations(other, 'h1', synced.data);
    await applyRecordAnnotations(other, 'h1', synced.data);

    const arrived = await liveAnnotations(other);
    expect(arrived).toHaveLength(1);
    expect(arrived[0]).toMatchObject({ page: 6, quote: '', note: 'shared thought' });
    expect(isPageNote(arrived[0])).toBe(true);
  });
});

describe('saveNoteText', () => {
  it('replaces the note text of an existing Note and stamps the edit for sync', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'first thought' });

    const saved = await saveNoteText(db, note.id, 'better thought', EDIT_STAMP);

    expect(isOk(saved) && saved.data?.note).toBe('better thought');
    expect((await liveAnnotations(db))[0].note).toBe('better thought');
    const synced = await listAnnotationsForSync(db, 'h1');
    if (!isOk(synced)) throw new Error(synced.error);
    expect(synced.data[0]).toMatchObject({ updatedAt: 200, updatedBy: 'dev-b' });
  });

  it('trims the text and keeps inner line breaks', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'first' });

    await saveNoteText(db, note.id, '  two\nlines \n', EDIT_STAMP);

    expect((await liveAnnotations(db))[0].note).toBe('two\nlines');
  });

  it('adds text to a plain Highlight, turning it into a Note', async () => {
    const db = await dbWithBook();
    const highlight = await addAnnotation(db);

    await saveNoteText(db, highlight.id, 'now with a thought', EDIT_STAMP);

    expect(listNotes(await liveAnnotations(db)).map((note) => note.note)).toEqual(['now with a thought']);
  });

  it('removes only the text when saving empty text on a Highlight, keeping its quote and color', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'to be removed', color: 'green' });

    const saved = await saveNoteText(db, note.id, '  \n ', EDIT_STAMP);

    expect(isOk(saved)).toBe(true);
    const stored = await liveAnnotations(db);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ quote: 'selected words', color: 'green', note: null });
    expect(listNotes(stored)).toEqual([]);
  });

  it('rejects empty text on a Page note and leaves its text as it was', async () => {
    const db = await dbWithBook();
    const pageNote = await addAnnotation(db, { quote: '', pageStart: null, pageEnd: null, note: 'about the page' });

    const saved = await saveNoteText(db, pageNote.id, '', EDIT_STAMP);

    expect(isOk(saved)).toBe(false);
    expect((await liveAnnotations(db))[0].note).toBe('about the page');
  });

  it('fails for an annotation that does not exist or was deleted', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'gone soon' });
    await deleteAnnotation(db, note.id, EDIT_STAMP);

    expect(isOk(await saveNoteText(db, note.id, 'late edit', EDIT_STAMP))).toBe(false);
    expect(isOk(await saveNoteText(db, 999, 'nothing here', EDIT_STAMP))).toBe(false);
  });
});

describe('setAnnotationColor', () => {
  it('changes the highlight color and stamps the edit for sync', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'thought', color: 'yellow' });

    const changed = await setAnnotationColor(db, note.id, 'blue', EDIT_STAMP);

    expect(isOk(changed) && changed.data.color).toBe('blue');
    const stored = await liveAnnotations(db);
    expect(stored[0]).toMatchObject({ color: 'blue', note: 'thought' });
    const synced = await listAnnotationsForSync(db, 'h1');
    if (!isOk(synced)) throw new Error(synced.error);
    expect(synced.data[0]).toMatchObject({ color: 'blue', updatedAt: 200, updatedBy: 'dev-b' });
  });

  it('rejects an unknown color and keeps the current one', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { color: 'pink' });

    const changed = await setAnnotationColor(db, note.id, 'purple' as NoteDraft['color'], EDIT_STAMP);

    expect(isOk(changed)).toBe(false);
    expect((await liveAnnotations(db))[0].color).toBe('pink');
  });

  it('fails for an annotation that does not exist', async () => {
    const db = await dbWithBook();

    expect(isOk(await setAnnotationColor(db, 999, 'blue', EDIT_STAMP))).toBe(false);
  });
});

describe('deleteNote', () => {
  it('removes the text of a Note on a Highlight and keeps the Highlight', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'my thought', color: 'blue' });

    const deleted = await deleteNote(db, note.id, EDIT_STAMP);

    expect(isOk(deleted) && deleted.data).toMatchObject({ id: note.id, note: null, color: 'blue' });
    const stored = await liveAnnotations(db);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ quote: 'selected words', color: 'blue', note: null });
    expect(listNotes(stored)).toEqual([]);
    expect(listNotes(stored, { includeHighlights: true })).toHaveLength(1);
  });

  it('deletes a Page note entirely, leaving no empty annotation behind', async () => {
    const db = await dbWithBook();
    const pageNote = await addAnnotation(db, { quote: '', pageStart: null, pageEnd: null, note: 'about the page' });

    const deleted = await deleteNote(db, pageNote.id, EDIT_STAMP);

    expect(isOk(deleted) && deleted.data).toBeNull();
    expect(await liveAnnotations(db)).toEqual([]);
  });

  it('propagates the removal of note text through sync as an edit, not a delete', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'my thought' });

    await deleteNote(db, note.id, EDIT_STAMP);

    const synced = await listAnnotationsForSync(db, 'h1');
    if (!isOk(synced)) throw new Error(synced.error);
    expect(synced.data[0]).toMatchObject({ note: null, deleted: false, updatedAt: 200 });
  });

  it('propagates the deletion of a Page note through sync as a tombstone', async () => {
    const db = await dbWithBook();
    const pageNote = await addAnnotation(db, { quote: '', pageStart: null, pageEnd: null, note: 'about the page' });

    await deleteNote(db, pageNote.id, EDIT_STAMP);

    const synced = await listAnnotationsForSync(db, 'h1');
    if (!isOk(synced)) throw new Error(synced.error);
    expect(synced.data[0]).toMatchObject({ deleted: true });
  });

  it('refuses a plain Highlight, which has no Note to delete, and keeps it', async () => {
    const db = await dbWithBook();
    const highlight = await addAnnotation(db);

    const deleted = await deleteNote(db, highlight.id, EDIT_STAMP);

    expect(isOk(deleted)).toBe(false);
    expect(await liveAnnotations(db)).toHaveLength(1);
  });

  it('fails for an annotation that does not exist', async () => {
    const db = await dbWithBook();

    expect(isOk(await deleteNote(db, 999, EDIT_STAMP))).toBe(false);
  });
});

describe('deleteAnnotation of each kind of annotation', () => {
  it('deletes a plain Highlight', async () => {
    const db = await dbWithBook();
    const highlight = await addAnnotation(db);

    expect(isOk(await deleteAnnotation(db, highlight.id, EDIT_STAMP))).toBe(true);

    expect(await liveAnnotations(db)).toEqual([]);
  });

  it('deletes a Highlight together with its Note', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'my thought' });

    expect(isOk(await deleteAnnotation(db, note.id, EDIT_STAMP))).toBe(true);

    expect(await liveAnnotations(db)).toEqual([]);
  });

  it('deletes a Page note', async () => {
    const db = await dbWithBook();
    const pageNote = await addAnnotation(db, { quote: '', pageStart: null, pageEnd: null, note: 'about the page' });

    expect(isOk(await deleteAnnotation(db, pageNote.id, EDIT_STAMP))).toBe(true);

    expect(await liveAnnotations(db)).toEqual([]);
  });
});

describe('getAnnotation', () => {
  it('reads a live annotation by id', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'my thought' });

    const read = await getAnnotation(db, note.id);

    expect(isOk(read) && read.data).toMatchObject({ id: note.id, note: 'my thought', quote: 'selected words' });
  });

  it('fails for a missing or deleted annotation', async () => {
    const db = await dbWithBook();
    const note = await addAnnotation(db, { note: 'gone soon' });
    await deleteAnnotation(db, note.id, EDIT_STAMP);

    expect(isOk(await getAnnotation(db, note.id))).toBe(false);
    expect(isOk(await getAnnotation(db, 999))).toBe(false);
  });
});

describe('isPageNote', () => {
  it('is true for an annotation with no quoted passage and false for one with a quote', async () => {
    const db = await dbWithBook();
    const pageNote = await addAnnotation(db, { quote: '  ', pageStart: null, pageEnd: null, note: 'about the page' });
    const onHighlight = await addAnnotation(db, { note: 'about a passage' });

    expect(isPageNote(pageNote)).toBe(true);
    expect(isPageNote(onHighlight)).toBe(false);
  });
});
