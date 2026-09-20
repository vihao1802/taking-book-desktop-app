import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  filesSchema,
  isOk,
  listAnnotations,
  listAnnotationsForSync,
  listNotes,
  saveNoteDraft,
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
