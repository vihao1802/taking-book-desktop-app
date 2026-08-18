import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  applyRecordAnnotations,
  createAnnotation,
  deleteAnnotation,
  filesSchema,
  isOk,
  listAnnotations,
  listAnnotationsForSync,
  setAnnotationNote,
  tombstoneAnnotationsForFile,
  upsertFile,
} from '../src';
import type { SyncAnnotation } from '../src';
import { createMemoryDriver } from './helpers';

function syncAnnotation(overrides: Partial<SyncAnnotation> = {}): SyncAnnotation {
  return {
    id: 1,
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

  it('a newer remote edit wins over a local one by id', async () => {
    const db = await dbWithBook();
    await createAnnotation(
      db,
      'h1',
      { page: 3, pageStart: 10, pageEnd: 24, quote: 'selected words', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null },
      { updatedAt: 100, updatedBy: 'dev-a' },
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
    await createAnnotation(
      db,
      'h1',
      { page: 3, pageStart: 10, pageEnd: 24, quote: 'selected words', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null },
      { updatedAt: 100, updatedBy: 'dev-a' },
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

describe('tombstoneAnnotationsForFile', () => {
  it('tombstones every annotation when the book is deleted', async () => {
    const db = await dbWithBook();
    await createAnnotation(
      db,
      'h1',
      { page: 1, pageStart: 0, pageEnd: 3, quote: 'a', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null },
    );
    await createAnnotation(
      db,
      'h1',
      { page: 2, pageStart: 1, pageEnd: 4, quote: 'b', color: 'blue', note: null, paraIndex: null, paraStart: null, paraEnd: null },
    );

    const tombstoned = await tombstoneAnnotationsForFile(db, 'h1', { updatedAt: 700, updatedBy: 'dev-a' });
    expect(isOk(tombstoned)).toBe(true);

    const live = await listAnnotations(db, 'h1');
    expect(isOk(live)).toBe(true);
    if (isOk(live)) expect(live.data).toHaveLength(0);

    const synced = await listAnnotationsForSync(db, 'h1');
    expect(isOk(synced)).toBe(true);
    if (isOk(synced)) expect(synced.data.every((a) => a.deleted)).toBe(true);
  });
});