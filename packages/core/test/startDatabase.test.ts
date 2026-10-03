import { describe, expect, it } from 'vitest';
import { isOk, listAnnotations, listFiles, startDatabase, upsertFile } from '../src';
import { createAnnotation, createMemoryDriver } from './helpers';

async function tableNames(db: ReturnType<typeof createMemoryDriver>): Promise<string[]> {
  const rows = await db.all("SELECT name FROM sqlite_master WHERE type = 'table'");
  return rows.map((row) => String(row.name));
}

describe('startDatabase', () => {
  it('creates every table and the migrated columns on a fresh database', async () => {
    const db = createMemoryDriver();
    const result = await startDatabase(db);
    expect(result).toEqual({ ok: true, data: [] });
    const names = await tableNames(db);
    for (const table of ['files', 'settings', 'reading_sessions', 'annotations', 'custom_sounds', 'quizzes']) {
      expect(names).toContain(table);
    }
    const annotationColumns = (await db.all('PRAGMA table_info(annotations)')).map((c) => String(c.name));
    expect(annotationColumns).toContain('uid');
    const fileColumns = (await db.all('PRAGMA table_info(files)')).map((c) => String(c.name));
    expect(fileColumns).toContain('updated_at');
  });

  it('is safe to run again on an already-migrated database without losing data', async () => {
    const db = createMemoryDriver();
    await startDatabase(db);
    const upserted = await upsertFile(db, { hash: 'h1', title: 'Book', filePath: '/b.pdf' });
    expect(isOk(upserted)).toBe(true);
    await createAnnotation(db, 'h1', { page: 1, pageStart: null, pageEnd: null, quote: 'x', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null });

    expect((await startDatabase(db)).ok).toBe(true);

    const files = await listFiles(db);
    expect(files.ok && files.data.map((f) => f.hash)).toEqual(['h1']);
    const annotations = await listAnnotations(db, 'h1');
    expect(annotations.ok && annotations.data).toHaveLength(1);
  });

  it('upgrades a database created by an earlier desktop version', async () => {
    const db = createMemoryDriver();
    await db.exec(`
      CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, path TEXT NOT NULL, title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unread', tags TEXT NOT NULL DEFAULT '[]', last_page INTEGER,
        last_position REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO files (hash, path, title) VALUES ('old', '/old.pdf', 'Old Book');
    `);
    expect((await startDatabase(db)).ok).toBe(true);
    const files = await listFiles(db);
    expect(files.ok && files.data.map((f) => f.title)).toEqual(['Old Book']);
  });

  it('still runs the annotation migration when the files migration fails', async () => {
    const db = createMemoryDriver();
    await startDatabase(db);
    await db.exec('DROP TABLE annotations; CREATE TABLE annotations (id INTEGER PRIMARY KEY AUTOINCREMENT, file_hash TEXT NOT NULL);');
    const failing: typeof db = { ...db, all: (sql, params) => (sql.includes('table_info(files)') ? Promise.reject(new Error('boom')) : db.all(sql, params)) };
    const result = await startDatabase(failing);
    expect(result.ok && result.data).toHaveLength(1);
    const columns = (await db.all('PRAGMA table_info(annotations)')).map((c) => String(c.name));
    expect(columns).toContain('uid');
  });

  it('reports an error when the tables cannot be created', async () => {
    const db = createMemoryDriver();
    const result = await startDatabase({ ...db, exec: () => Promise.reject(new Error('locked')) });
    expect(result.ok).toBe(false);
  });
});
