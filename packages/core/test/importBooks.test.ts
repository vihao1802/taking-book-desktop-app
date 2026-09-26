import { describe, expect, it } from 'vitest';
import {
  deleteFile,
  filesSchema,
  getLastPosition,
  importBooks,
  isOk,
  listFiles,
  saveLastPosition,
  upsertFile,
} from '../src';
import type { ImportFileSystem, ImportSummary, SqlDriver } from '../src';
import { createMemoryDriver } from './helpers';

interface FakeEntry {
  kind: 'file' | 'directory';
  hash: string;
  copyFails?: boolean;
}

/** In-memory stand-in for the platform file system: records what was copied into the store. */
function createFakeFileSystem(entries: Record<string, FakeEntry>): ImportFileSystem & { stored: string[] } {
  const stored: string[] = [];
  function entry(path: string): FakeEntry {
    const found = entries[path];
    if (!found) throw new Error(`ENOENT: ${path}`);
    return found;
  }
  return {
    stored,
    async stat(path) {
      return entry(path).kind;
    },
    async hashFile(path) {
      return entry(path).hash;
    },
    async copyToStore(path, hash) {
      if (entry(path).copyFails) throw new Error('EACCES: permission denied');
      stored.push(hash);
      return `/store/${hash}`;
    },
  };
}

async function setUp(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await db.exec(filesSchema());
  return db;
}

async function runImport(db: SqlDriver, paths: string[], fileSystem: ImportFileSystem): Promise<ImportSummary> {
  const result = await importBooks(db, { paths, fileSystem, stamp: { updatedAt: 100, updatedBy: 'device' } });
  if (!isOk(result)) throw new Error(result.error);
  return result.data;
}

describe('importBooks', () => {
  it('adds a single PDF, titled after its file name, from the copy in the store', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({ '/docs/Deep Work.pdf': { kind: 'file', hash: 'h1' } });

    const summary = await runImport(db, ['/docs/Deep Work.pdf'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['Deep Work']);
    expect(summary.added[0]?.path).toBe('/store/h1');
    expect(summary.alreadyInLibrary).toEqual([]);
    expect(summary.skipped).toEqual([]);
    expect(fileSystem.stored).toEqual(['h1']);
    const listed = await listFiles(db);
    expect(isOk(listed) && listed.data.map((b) => b.hash)).toEqual(['h1']);
  });

  it('adds several PDFs', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/a.pdf': { kind: 'file', hash: 'ha' },
      '/b.pdf': { kind: 'file', hash: 'hb' },
      '/c.pdf': { kind: 'file', hash: 'hc' },
    });

    const summary = await runImport(db, ['/a.pdf', '/b.pdf', '/c.pdf'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['a', 'b', 'c']);
  });

  it('accepts an uppercase .PDF extension', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({ 'C:\\Books\\SCAN.PDF': { kind: 'file', hash: 'hs' } });

    const summary = await runImport(db, ['C:\\Books\\SCAN.PDF'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['SCAN']);
  });

  it('skips a file that is not a PDF and still adds the PDFs beside it', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/notes.txt': { kind: 'file', hash: 'ht' },
      '/book.pdf': { kind: 'file', hash: 'hb' },
    });

    const summary = await runImport(db, ['/notes.txt', '/book.pdf'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['book']);
    expect(summary.skipped).toEqual([{ fileName: 'notes.txt', reason: 'not-pdf', detail: null }]);
    expect(fileSystem.stored).toEqual(['hb']);
  });

  it('counts a PDF whose Book is already in the library without adding it again', async () => {
    const db = await setUp();
    await upsertFile(db, { filePath: '/store/hd', hash: 'hd', title: 'Renamed by reader' });
    const fileSystem = createFakeFileSystem({ '/dup.pdf': { kind: 'file', hash: 'hd' } });

    const summary = await runImport(db, ['/dup.pdf'], fileSystem);

    expect(summary.added).toEqual([]);
    expect(summary.alreadyInLibrary.map((b) => b.title)).toEqual(['Renamed by reader']);
    expect(fileSystem.stored).toEqual([]);
  });

  it('revives a deleted Book with its last-read position and counts it as added', async () => {
    const db = await setUp();
    const created = await upsertFile(db, { filePath: '/store/old', hash: 'hr', title: 'Revived' });
    if (!isOk(created)) throw new Error(created.error);
    await saveLastPosition(db, created.data.id, { page: 12, position: 0.4, mode: 'page' });
    await deleteFile(db, created.data.id);
    const fileSystem = createFakeFileSystem({ '/again.pdf': { kind: 'file', hash: 'hr' } });

    const summary = await runImport(db, ['/again.pdf'], fileSystem);

    expect(summary.added.map((b) => b.id)).toEqual([created.data.id]);
    expect(summary.alreadyInLibrary).toEqual([]);
    const position = await getLastPosition(db, created.data.id);
    expect(isOk(position) && position.data).toEqual({ page: 12, position: 0.4, mode: 'page' });
  });

  it('counts the same path given twice once', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({ '/twice.pdf': { kind: 'file', hash: 'h2' } });

    const summary = await runImport(db, ['/twice.pdf', '/twice.pdf'], fileSystem);

    expect(summary.added).toHaveLength(1);
    expect(summary.alreadyInLibrary).toEqual([]);
    expect(fileSystem.stored).toEqual(['h2']);
  });

  it('counts identical content reached through two paths once', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/inbox/report.pdf': { kind: 'file', hash: 'hsame' },
      '/archive/report copy.pdf': { kind: 'file', hash: 'hsame' },
    });

    const summary = await runImport(db, ['/inbox/report.pdf', '/archive/report copy.pdf'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['report']);
    expect(summary.alreadyInLibrary).toEqual([]);
    expect(fileSystem.stored).toEqual(['hsame']);
  });

  it('skips a file that cannot be copied, by name, and still adds the others', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/ok-1.pdf': { kind: 'file', hash: 'h1' },
      '/locked.pdf': { kind: 'file', hash: 'hl', copyFails: true },
      '/ok-2.pdf': { kind: 'file', hash: 'h2' },
    });

    const summary = await runImport(db, ['/ok-1.pdf', '/locked.pdf', '/ok-2.pdf'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['ok-1', 'ok-2']);
    expect(summary.skipped).toEqual([
      { fileName: 'locked.pdf', reason: 'unreadable', detail: expect.stringContaining('EACCES') },
    ]);
    const listed = await listFiles(db);
    expect(isOk(listed) && listed.data).toHaveLength(2);
  });

  it('skips a PDF path that no longer exists as unreadable', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({});

    const summary = await runImport(db, ['/gone.pdf'], fileSystem);

    expect(summary.skipped).toEqual([
      { fileName: 'gone.pdf', reason: 'unreadable', detail: expect.stringContaining('ENOENT') },
    ]);
  });

  it('skips a directory as not a PDF', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({ '/folder.pdf': { kind: 'directory', hash: '' } });

    const summary = await runImport(db, ['/folder.pdf'], fileSystem);

    expect(summary.skipped).toEqual([{ fileName: 'folder.pdf', reason: 'not-pdf', detail: null }]);
  });

  it('returns an error when the library cannot be written', async () => {
    const db = createMemoryDriver();
    const fileSystem = createFakeFileSystem({ '/a.pdf': { kind: 'file', hash: 'ha' } });

    const result = await importBooks(db, { paths: ['/a.pdf'], fileSystem, stamp: { updatedAt: 1, updatedBy: 'd' } });

    expect(isOk(result)).toBe(false);
  });
});
