import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  applySyncRecords,
  createAnnotation,
  deleteFile,
  filesSchema,
  isOk,
  listAnnotations,
  listFiles,
  listRecordsForSync,
  migrateFilesSchema,
  setFileStatus,
  upsertFile,
} from '../src';
import { createMemoryDriver } from './helpers';
import type { SyncRecord } from '../src/sync/types';

function record(hash: string, overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    hash,
    title: 'Title',
    status: 'unread',
    tags: [],
    favorite: false,
    lastPage: null,
    lastPosition: null,
    pageCount: null,
    annotations: [],
    updatedAt: 100,
    updatedBy: 'dev-a',
    deleted: false,
    ...overrides,
  };
}

describe('migrateFilesSchema', () => {
  it('adds sync columns to an old-schema table', async () => {
    const db = createMemoryDriver();
    await db.exec(`
      CREATE TABLE files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unread',
        tags TEXT NOT NULL DEFAULT '[]',
        last_page INTEGER,
        last_position REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await db.run("INSERT INTO files (hash, path, title) VALUES ('h', '/p', 't')");

    const migrated = await migrateFilesSchema(db);
    expect(isOk(migrated)).toBe(true);

    const records = await listRecordsForSync(db);
    expect(isOk(records)).toBe(true);
    if (isOk(records)) {
      expect(records.data[0].updatedAt).toBe(0);
      expect(records.data[0].deleted).toBe(false);
    }
  });

  it('is a no-op on a fresh schema', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const migrated = await migrateFilesSchema(db);
    expect(isOk(migrated)).toBe(true);
  });
});

describe('listRecordsForSync', () => {
  it('includes tombstoned records so deletes propagate', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const created = await upsertFile(db, { filePath: '/a.pdf', hash: 'h', title: 'A' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    await deleteFile(db, created.data.id, { updatedAt: 200, updatedBy: 'dev-a' });

    const records = await listRecordsForSync(db);
    expect(isOk(records)).toBe(true);
    if (isOk(records)) {
      expect(records.data).toHaveLength(1);
      expect(records.data[0].deleted).toBe(true);
      expect(records.data[0].updatedAt).toBe(200);
    }

    const live = await listFiles(db);
    expect(isOk(live)).toBe(true);
    if (isOk(live)) expect(live.data).toHaveLength(0);
  });
});

describe('applySyncRecords', () => {
  it('inserts new live records with the resolved path', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const applied = await applySyncRecords(db, [record('h1')], (hash) => `/blobs/${hash}`);
    expect(isOk(applied)).toBe(true);

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) {
      expect(files.data[0].hash).toBe('h1');
      expect(files.data[0].path).toBe('/blobs/h1');
    }
  });

  it('skips a tombstone with no local row', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const applied = await applySyncRecords(db, [record('ghost', { deleted: true })], (h) => h);
    expect(isOk(applied)).toBe(true);

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) expect(files.data).toHaveLength(0);
  });

  it('round-trips lastReadAt and treats a missing value as null', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await db.exec(annotationsSchema());
    await applySyncRecords(
      db,
      [record('h', { lastReadAt: 555, updatedAt: 200 }), record('old', { updatedAt: 200 })],
      () => '/ignored',
    );
    const records = await listRecordsForSync(db);
    if (!isOk(records)) return;
    expect(records.data.find((r) => r.hash === 'h')?.lastReadAt).toBe(555);
    expect(records.data.find((r) => r.hash === 'old')?.lastReadAt).toBeNull();
  });

  it('round-trips zoom through list and apply', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    await upsertFile(db, { filePath: '/z.pdf', hash: 'h', title: 'A' });
    await applySyncRecords(db, [record('h', { zoom: 1.6, updatedAt: 200 })], () => '/ignored');

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) expect(files.data[0].zoom).toBe(1.6);

    const records = await listRecordsForSync(db);
    expect(isOk(records)).toBe(true);
    if (isOk(records)) expect(records.data[0].zoom).toBe(1.6);

    const other = createMemoryDriver();
    await other.exec(`${filesSchema()} ${annotationsSchema()}`);
    await applySyncRecords(other, [records.data[0]], () => '/blobs/h');
    const synced = await listFiles(other);
    expect(isOk(synced)).toBe(true);
    if (isOk(synced)) expect(synced.data[0].zoom).toBe(1.6);
  });

  it('updates an existing record and tombstones a winner', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const created = await upsertFile(db, { filePath: '/orig.pdf', hash: 'h', title: 'A' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    await applySyncRecords(
      db,
      [record('h', { title: 'Renamed', status: 'finished', updatedAt: 200 })],
      () => '/ignored',
    );

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) {
      expect(files.data[0].title).toBe('Renamed');
      expect(files.data[0].status).toBe('finished');
      expect(files.data[0].path).toBe('/orig.pdf');
    }

    await applySyncRecords(db, [record('h', { deleted: true, updatedAt: 300 })], () => '/ignored');
    const live = await listFiles(db);
    expect(isOk(live)).toBe(true);
    if (isOk(live)) expect(live.data).toHaveLength(0);
  });
});

describe('annotations in sync records', () => {
  it('includes annotations in listed records and applies them on sync', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const created = await upsertFile(db, { filePath: '/a.pdf', hash: 'h', title: 'A' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    const anno = await createAnnotation(
      db,
      'h',
      { page: 4, pageStart: 5, pageEnd: 9, quote: 'text', color: 'green', note: 'look here', paraIndex: 2, paraStart: 1, paraEnd: 5 },
      { updatedAt: 200, updatedBy: 'dev-a' },
    );
    expect(isOk(anno)).toBe(true);

    const records = await listRecordsForSync(db);
    expect(isOk(records)).toBe(true);
    if (isOk(records)) {
      expect(records.data[0].annotations).toHaveLength(1);
      expect(records.data[0].annotations[0].note).toBe('look here');
      expect(records.data[0].annotations[0].deleted).toBe(false);
    }

    const other = createMemoryDriver();
    await other.exec(`${filesSchema()} ${annotationsSchema()}`);
    const applied = await applySyncRecords(other, [records.data[0]], (h) => `/blobs/${h}`);
    expect(isOk(applied)).toBe(true);

    const listed = await listAnnotations(other, 'h');
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.data).toHaveLength(1);
      expect(listed.data[0].quote).toBe('text');
      expect(listed.data[0].color).toBe('green');
    }
  });

  it('tombstones annotations when a deleted file record is applied', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const created = await upsertFile(db, { filePath: '/a.pdf', hash: 'h', title: 'A' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    await createAnnotation(
      db,
      'h',
      { page: 1, pageStart: 0, pageEnd: 2, quote: 'hi', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null },
    );

    await applySyncRecords(db, [record('h', { deleted: true, updatedAt: 400 })], () => '/ignored');

    const live = await listAnnotations(db, 'h');
    expect(isOk(live)).toBe(true);
    if (isOk(live)) expect(live.data).toHaveLength(0);

    const records = await listRecordsForSync(db);
    expect(isOk(records)).toBe(true);
    if (isOk(records)) expect(records.data[0].annotations.every((a) => a.deleted)).toBe(true);
  });
});

describe('mutators stamp records', () => {
  it('setFileStatus records the provided stamp', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${annotationsSchema()}`);
    const created = await upsertFile(db, { filePath: '/s.pdf', hash: 'h', title: 'S' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    await setFileStatus(db, created.data.id, 'reading', { updatedAt: 999, updatedBy: 'dev-b' });

    const records = await listRecordsForSync(db);
    expect(isOk(records)).toBe(true);
    if (isOk(records)) {
      expect(records.data[0].status).toBe('reading');
      expect(records.data[0].updatedAt).toBe(999);
      expect(records.data[0].updatedBy).toBe('dev-b');
    }
  });
});
