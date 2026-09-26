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
import type { ImportFileSystem, ImportProgress, ImportSummary, SqlDriver } from '../src';
import { createMemoryDriver } from './helpers';

interface FakeEntry {
  kind: 'file' | 'directory';
  hash: string;
  copyFails?: boolean;
  listFails?: boolean;
}

/** Folders hold no bytes, so they need no hash. */
const FOLDER: FakeEntry = { kind: 'directory', hash: '' };

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/**
 * In-memory stand-in for the platform file system: records what was copied
 * into the store. A directory's children are the entries directly under its path.
 */
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
    async listDirectory(path) {
      if (entry(path).listFails) throw new Error('EACCES: permission denied');
      return Object.keys(entries).filter((child) => parentOf(child) === path);
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

async function runImport(
  db: SqlDriver,
  paths: string[],
  fileSystem: ImportFileSystem,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportSummary> {
  const result = await importBooks(db, { paths, fileSystem, stamp: { updatedAt: 100, updatedBy: 'device' }, onProgress });
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

  it('adds the PDFs in a folder and in all of its subfolders', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/books': FOLDER,
      '/books/top.pdf': { kind: 'file', hash: 'ht' },
      '/books/fiction': FOLDER,
      '/books/fiction/novel.pdf': { kind: 'file', hash: 'hn' },
      '/books/fiction/classics': FOLDER,
      '/books/fiction/classics/old.pdf': { kind: 'file', hash: 'ho' },
    });

    const summary = await runImport(db, ['/books'], fileSystem);

    expect(summary.added.map((b) => b.title).sort()).toEqual(['novel', 'old', 'top']);
    expect(summary.skipped).toEqual([]);
  });

  it('adds the PDFs in a folder and skips the other files beside them', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/mixed': FOLDER,
      '/mixed/paper.pdf': { kind: 'file', hash: 'hp' },
      '/mixed/cover.jpg': { kind: 'file', hash: 'hj' },
      '/mixed/readme.txt': { kind: 'file', hash: 'hr' },
    });

    const summary = await runImport(db, ['/mixed'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['paper']);
    expect(summary.skipped).toEqual([
      { fileName: 'cover.jpg', reason: 'not-pdf', detail: null },
      { fileName: 'readme.txt', reason: 'not-pdf', detail: null },
    ]);
  });

  it('adds nothing from an empty folder', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({ '/empty': FOLDER, '/empty/nested': FOLDER });

    const summary = await runImport(db, ['/empty'], fileSystem);

    expect(summary).toEqual({ added: [], alreadyInLibrary: [], skipped: [] });
  });

  it('searches a folder whose name ends in .pdf instead of skipping it', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/folder.pdf': FOLDER,
      '/folder.pdf/inside.pdf': { kind: 'file', hash: 'hi' },
    });

    const summary = await runImport(db, ['/folder.pdf'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['inside']);
    expect(summary.skipped).toEqual([]);
  });

  it('counts a file dropped directly and also reached through its folder once', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/shelf': FOLDER,
      '/shelf/one.pdf': { kind: 'file', hash: 'h1' },
      '/shelf/two.pdf': { kind: 'file', hash: 'h2' },
    });
    const reports: ImportProgress[] = [];

    const summary = await runImport(db, ['/shelf/one.pdf', '/shelf'], fileSystem, (p) => reports.push(p));

    expect(summary.added.map((b) => b.title)).toEqual(['one', 'two']);
    expect(summary.alreadyInLibrary).toEqual([]);
    expect(fileSystem.stored).toEqual(['h1', 'h2']);
    expect(reports.at(-1)).toEqual({ done: 2, total: 2 });
  });

  it('skips a folder that cannot be listed, by name, and still adds the others', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({
      '/locked': { ...FOLDER, listFails: true },
      '/book.pdf': { kind: 'file', hash: 'hb' },
    });

    const summary = await runImport(db, ['/locked', '/book.pdf'], fileSystem);

    expect(summary.added.map((b) => b.title)).toEqual(['book']);
    expect(summary.skipped).toEqual([
      { fileName: 'locked', reason: 'unreadable', detail: expect.stringContaining('EACCES') },
    ]);
  });

  it('reports progress once the PDFs are found and after each one, counting only PDFs, up to the final count', async () => {
    const db = await setUp();
    await upsertFile(db, { filePath: '/store/hk', hash: 'hk', title: 'Known' });
    const fileSystem = createFakeFileSystem({
      '/drop': FOLDER,
      '/drop/a.pdf': { kind: 'file', hash: 'ha' },
      '/drop/known.pdf': { kind: 'file', hash: 'hk' },
      '/drop/skip.txt': { kind: 'file', hash: 'hs' },
      '/drop/sub': FOLDER,
      '/drop/sub/b.pdf': { kind: 'file', hash: 'hb' },
    });
    const reports: ImportProgress[] = [];

    await runImport(db, ['/drop'], fileSystem, (p) => reports.push(p));

    expect(reports).toEqual([
      { done: 0, total: 3 },
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  });

  it('reports no progress when there is no PDF to import', async () => {
    const db = await setUp();
    const fileSystem = createFakeFileSystem({ '/notes.txt': { kind: 'file', hash: 'ht' } });
    const reports: ImportProgress[] = [];

    await runImport(db, ['/notes.txt'], fileSystem, (p) => reports.push(p));

    expect(reports).toEqual([]);
  });

  it('returns an error when the library cannot be written', async () => {
    const db = createMemoryDriver();
    const fileSystem = createFakeFileSystem({ '/a.pdf': { kind: 'file', hash: 'ha' } });

    const result = await importBooks(db, { paths: ['/a.pdf'], fileSystem, stamp: { updatedAt: 1, updatedBy: 'd' } });

    expect(isOk(result)).toBe(false);
  });
});
