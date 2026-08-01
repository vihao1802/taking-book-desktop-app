import { describe, expect, it } from 'vitest';
import {
  applySyncRecords,
  deleteFile,
  filesSchema,
  isOk,
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
    lastPage: null,
    lastPosition: null,
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
    await db.exec(filesSchema());
    const migrated = await migrateFilesSchema(db);
    expect(isOk(migrated)).toBe(true);
  });
});

describe('listRecordsForSync', () => {
  it('includes tombstoned records so deletes propagate', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
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
    await db.exec(filesSchema());
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
    await db.exec(filesSchema());
    const applied = await applySyncRecords(db, [record('ghost', { deleted: true })], (h) => h);
    expect(isOk(applied)).toBe(true);

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) expect(files.data).toHaveLength(0);
  });

  it('updates an existing record and tombstones a winner', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
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

describe('mutators stamp records', () => {
  it('setFileStatus records the provided stamp', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
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
