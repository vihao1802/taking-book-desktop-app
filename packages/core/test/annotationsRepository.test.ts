import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  applyRecordAnnotations,
  deleteAnnotation,
  deleteFile,
  filesSchema,
  isOk,
  listAnnotations,
  listAnnotationsForSync,
  listLibraryAnnotations,
  setAnnotationNote,
  upsertFile,
} from '../src';
import type { SqlDriver, SyncAnnotation } from '../src';
import { createAnnotation as createAnnotationCore } from '../src';
import { createAnnotation, createMemoryDriver } from './helpers';

function syncAnnotation(overrides: Partial<SyncAnnotation> = {}): SyncAnnotation {
  return {
    id: 1,
    uid: 'sync-uid-1',
    page: 3,
    pageStart: 10,
    pageEnd: 24,
    quote: 'selected words',
    color: 'yellow',
    note: null,
    paraIndex: null,
    paraStart: null,
    paraEnd: null,
    updatedAt: 100,
    updatedBy: 'dev-a',
    deleted: false,
    ...overrides,
  };
}

async function dbWithBook(hash = 'h1') {
  const db = createMemoryDriver();
  await db.exec(`${filesSchema()} ${annotationsSchema()}`);
  const created = await upsertFile(db, { filePath: '/a.pdf', hash, title: 'A' });
  expect(isOk(created)).toBe(true);
  return db;
}

describe('createAnnotation / listAnnotations', () => {
  it('stores and lists a highlight in page order', async () => {
    const db = await dbWithBook();
    await createAnnotation(
      db,
      'h1',
      { page: 5, pageStart: 0, pageEnd: 4, quote: 'abc', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null },
      { updatedAt: 200, updatedBy: 'dev-a' },
    );
    await createAnnotation(
      db,
      'h1',
      { page: 2, pageStart: 1, pageEnd: 3, quote: 'de', color: 'green', note: 'my note', paraIndex: null, paraStart: null, paraEnd: null },
      { updatedAt: 300, updatedBy: 'dev-a' },
    );

    const listed = await listAnnotations(db, 'h1');
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.data).toHaveLength(2);
      expect(listed.data[0].page).toBe(2);
      expect(listed.data[0].note).toBe('my note');
      expect(listed.data[0].updatedAt).toBe(300);
      expect(listed.data[1].color).toBe('yellow');
    }
  });

  it('rejects an unknown highlight color', async () => {
    const db = await dbWithBook();
    const result = await createAnnotation(
      db,
      'h1',
      // @ts-expect-error intentionally passing an invalid color
      { page: 1, pageStart: 0, pageEnd: 2, quote: 'x', color: 'purple', note: null, paraIndex: null, paraStart: null, paraEnd: null },
    );
    expect(isOk(result)).toBe(false);
  });
});

describe('setAnnotationNote / deleteAnnotation', () => {
  it('attaches a comment to a highlight', async () => {
    const db = await dbWithBook();
    const created = await createAnnotation(
      db,
      'h1',
      { page: 1, pageStart: 0, pageEnd: 4, quote: 'word', color: 'blue', note: null, paraIndex: null, paraStart: null, paraEnd: null },
    );
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const updated = await setAnnotationNote(db, created.data.id, 'a comment', { updatedAt: 500, updatedBy: 'dev-b' });
    expect(isOk(updated)).toBe(true);
    if (isOk(updated)) {
      expect(updated.data.note).toBe('a comment');
      expect(updated.data.updatedBy).toBe('dev-b');
    }
  });

  it('tombstones a highlight so it leaves the live list but stays for sync', async () => {
    const db = await dbWithBook();
    const created = await createAnnotation(
      db,
      'h1',
      { page: 1, pageStart: 0, pageEnd: 4, quote: 'word', color: 'pink', note: null, paraIndex: null, paraStart: null, paraEnd: null },
    );
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const removed = await deleteAnnotation(db, created.data.id, { updatedAt: 900, updatedBy: 'dev-a' });
    expect(isOk(removed)).toBe(true);

    const live = await listAnnotations(db, 'h1');
    expect(isOk(live)).toBe(true);
    if (isOk(live)) expect(live.data).toHaveLength(0);

    const synced = await listAnnotationsForSync(db, 'h1');
    expect(isOk(synced)).toBe(true);
    if (isOk(synced)) {
      expect(synced.data).toHaveLength(1);
      expect(synced.data[0].deleted).toBe(true);
      expect(synced.data[0].updatedAt).toBe(900);
    }
  });
});

describe('applyRecordAnnotations', () => {
  it('writes remote annotations for a fresh book', async () => {
    const db = await dbWithBook();
    const applied = await applyRecordAnnotations(db, 'h1', [syncAnnotation()]);
    expect(isOk(applied)).toBe(true);

    const listed = await listAnnotations(db, 'h1');
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0].quote).toBe('selected words');
      expect(listed.data[0].id).toBe(1);
    }
  });

  it('a newer remote edit wins over a local one with the same uid', async () => {
    const db = await dbWithBook();
    await createAnnotationCore(
      db,
      'h1',
      { page: 3, pageStart: 10, pageEnd: 24, quote: 'selected words', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null },
      { generateUid: () => 'sync-uid-1', stamp: { updatedAt: 100, updatedBy: 'dev-a' } },
    );
    const applied = await applyRecordAnnotations(db, 'h1', [
      syncAnnotation({ note: 'edited remotely', updatedAt: 400, updatedBy: 'dev-remote' }),
    ]);
    expect(isOk(applied)).toBe(true);

    const listed = await listAnnotations(db, 'h1');
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.data[0].note).toBe('edited remotely');
      expect(listed.data[0].updatedBy).toBe('dev-remote');
    }
  });

  it('a remote tombstone deletes a local annotation', async () => {
    const db = await dbWithBook();
    await createAnnotationCore(
      db,
      'h1',
      { page: 3, pageStart: 10, pageEnd: 24, quote: 'selected words', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null },
      { generateUid: () => 'sync-uid-1', stamp: { updatedAt: 100, updatedBy: 'dev-a' } },
    );
    const applied = await applyRecordAnnotations(db, 'h1', [
      syncAnnotation({ deleted: true, updatedAt: 500, updatedBy: 'dev-remote' }),
    ]);
    expect(isOk(applied)).toBe(true);

    const live = await listAnnotations(db, 'h1');
    expect(isOk(live)).toBe(true);
    if (isOk(live)) expect(live.data).toHaveLength(0);
  });

  it('keeps a local-only annotation the remote never saw', async () => {
    const db = await dbWithBook();
    await createAnnotation(
      db,
      'h1',
      { page: 7, pageStart: 0, pageEnd: 2, quote: 'hi', color: 'green', note: null, paraIndex: null, paraStart: null, paraEnd: null },
      { updatedAt: 100, updatedBy: 'dev-a' },
    );
    const applied = await applyRecordAnnotations(db, 'h1', []);
    expect(isOk(applied)).toBe(true);

    const listed = await listAnnotations(db, 'h1');
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) expect(listed.data).toHaveLength(1);
  });
});

const HIGHLIGHT_INPUT = {
  pageStart: 0,
  pageEnd: 3,
  color: 'yellow',
  note: null,
  paraIndex: null,
  paraStart: null,
  paraEnd: null,
} as const;

async function listQuotes(db: SqlDriver, hash = 'h1'): Promise<string[]> {
  const listed = await listAnnotations(db, hash);
  expect(isOk(listed)).toBe(true);
  return isOk(listed) ? listed.data.map((annotation) => annotation.quote) : [];
}

describe('annotations of a book removed from the library', () => {
  async function removeBook(db: SqlDriver, hash = 'h1'): Promise<void> {
    const file = await db.get('SELECT id FROM files WHERE hash = ?', [hash]);
    expect(file).toBeDefined();
    const removed = await deleteFile(db, Number(file?.id));
    expect(isOk(removed)).toBe(true);
  }

  it('keeps them stored but hides them from every list', async () => {
    const db = await dbWithBook();
    await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'a', note: 'my note' });
    await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 2, quote: 'b' });

    await removeBook(db);

    expect(await listQuotes(db)).toEqual([]);
    const synced = await listAnnotationsForSync(db, 'h1');
    expect(isOk(synced)).toBe(true);
    if (isOk(synced)) {
      expect(synced.data).toHaveLength(2);
      expect(synced.data.every((annotation) => !annotation.deleted)).toBe(true);
    }
  });

  it('shows them again when the same file is imported again', async () => {
    const db = await dbWithBook();
    await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'a', note: 'my note' });
    await removeBook(db);

    const reimported = await upsertFile(db, { filePath: '/moved/a.pdf', hash: 'h1', title: 'A' });
    expect(isOk(reimported)).toBe(true);

    const listed = await listAnnotations(db, 'h1');
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.data.map((annotation) => annotation.note)).toEqual(['my note']);
    }
  });

  it('does not show them for a different file that is still in the library', async () => {
    const db = await dbWithBook('h1');
    await upsertFile(db, { filePath: '/b.pdf', hash: 'h2', title: 'B' });
    await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'a' });
    await createAnnotation(db, 'h2', { ...HIGHLIGHT_INPUT, page: 1, quote: 'b' });

    await removeBook(db, 'h1');

    expect(await listQuotes(db, 'h1')).toEqual([]);
    expect(await listQuotes(db, 'h2')).toEqual(['b']);
  });

  it('leaves an explicitly deleted annotation deleted after the book returns', async () => {
    const db = await dbWithBook();
    const keep = await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'keep' });
    const drop = await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 2, quote: 'drop' });
    expect(isOk(keep) && isOk(drop)).toBe(true);
    if (!isOk(drop)) return;
    await deleteAnnotation(db, drop.data.id);

    await removeBook(db);
    await upsertFile(db, { filePath: '/a.pdf', hash: 'h1', title: 'A' });

    expect(await listQuotes(db)).toEqual(['keep']);
  });

  it('still deletes a live annotation explicitly', async () => {
    const db = await dbWithBook();
    const created = await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'a' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const deleted = await deleteAnnotation(db, created.data.id);

    expect(isOk(deleted)).toBe(true);
    expect(await listQuotes(db)).toEqual([]);
  });
});

describe('annotations of a book that was never in the library', () => {
  it('are stored but not listed until the book is imported', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    await applyRecordAnnotations(db, 'h9', [syncAnnotation({ id: 4, quote: 'orphan' })]);

    expect(await listQuotes(db, 'h9')).toEqual([]);

    await upsertFile(db, { filePath: '/n.pdf', hash: 'h9', title: 'N' });
    expect(await listQuotes(db, 'h9')).toEqual(['orphan']);
  });
});

describe('listLibraryAnnotations', () => {
  async function listLibraryQuotes(db: SqlDriver): Promise<string[]> {
    const listed = await listLibraryAnnotations(db);
    expect(isOk(listed)).toBe(true);
    return isOk(listed) ? listed.data.map((annotation) => annotation.quote).sort() : [];
  }

  it('lists the live annotations of every book in the library', async () => {
    const db = await dbWithBook('h1');
    await upsertFile(db, { filePath: '/b.pdf', hash: 'h2', title: 'B' });
    await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'from a' });
    await createAnnotation(db, 'h2', { ...HIGHLIGHT_INPUT, page: 1, quote: 'from b' });

    expect(await listLibraryQuotes(db)).toEqual(['from a', 'from b']);
  });

  it('leaves out deleted annotations and those of a book removed from the library', async () => {
    const db = await dbWithBook('h1');
    await upsertFile(db, { filePath: '/b.pdf', hash: 'h2', title: 'B' });
    await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'kept' });
    const doomed = await createAnnotation(db, 'h1', { ...HIGHLIGHT_INPUT, page: 1, quote: 'deleted' });
    await createAnnotation(db, 'h2', { ...HIGHLIGHT_INPUT, page: 1, quote: 'orphaned' });
    if (isOk(doomed)) await deleteAnnotation(db, doomed.data.id);
    const removed = await db.get('SELECT id FROM files WHERE hash = ?', ['h2']);
    await deleteFile(db, Number(removed?.id));

    expect(await listLibraryQuotes(db)).toEqual(['kept']);
  });
});
