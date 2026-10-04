import { beforeEach, describe, expect, it } from 'vitest';
import { createLibraryService, isOk, ok, sha256Hex, startDatabase, type LibraryService, type SqlDriver } from '@taking-book/core';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';
import { createFakeConnection } from './fake-sqlite-connection';
import { createPickedPdfImport, type IncomingBookStorage, type PickedPdf } from './picked-pdf-file-system';

/** In-memory stand-in for the app's book folder: temporary files and stored Books by path. */
function createFakeStorage(): IncomingBookStorage & { files: Map<string, number[]> } {
  const files = new Map<string, number[]>();
  return {
    files,
    create: async (path) => void files.set(path, []),
    append: async (path, block) => void files.get(path)?.push(...block),
    commit: async (path, hash) => {
      const stored = `books/${hash}.pdf`;
      files.set(stored, files.get(path) ?? []);
      files.delete(path);
      return stored;
    },
    discard: async (path) => void files.delete(path),
  };
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe('createPickedPdfImport', () => {
  const contents: Record<string, Uint8Array> = {
    'content://docs/1': new TextEncoder().encode('first pdf'),
    'content://docs/2': new TextEncoder().encode('second pdf'),
    'content://docs/1-again': new TextEncoder().encode('first pdf'),
  };
  let db: SqlDriver;
  let library: LibraryService;
  let storage: ReturnType<typeof createFakeStorage>;
  const logged: string[] = [];

  beforeEach(async () => {
    db = createCapacitorSqlDriver(createFakeConnection());
    await startDatabase(db);
    library = createLibraryService(db, {
      getDeviceId: async () => 'phone',
      coverStore: { read: async () => ok(null), write: async () => ok(undefined) },
      reflowStore: { read: async () => ok(null), write: async () => ok(undefined) },
    });
    storage = createFakeStorage();
    logged.length = 0;
  });

  async function importPicked(picked: PickedPdf[]): ReturnType<LibraryService['importBooks']> {
    const session = createPickedPdfImport({
      picked,
      storage,
      openStream: async (webPath) => streamOf(contents[webPath]),
      generateId: () => 'run',
      log: (message) => logged.push(message),
    });
    const result = await library.importBooks({ paths: session.paths, fileSystem: session.fileSystem });
    await session.discardLeftovers();
    return result;
  }

  it('adds a picked PDF keyed by content hash, titled by its name, with its own copy in storage', async () => {
    const result = await importPicked([{ name: 'Dune.pdf', webPath: 'content://docs/1' }]);
    if (!isOk(result)) throw new Error(result.error);
    const hash = sha256Hex(contents['content://docs/1']);
    expect(result.data.added.map((book) => [book.title, book.hash, book.path])).toEqual([
      ['Dune', hash, `books/${hash}.pdf`],
    ]);
    expect(Uint8Array.from(storage.files.get(`books/${hash}.pdf`) ?? [])).toEqual(contents['content://docs/1']);
    expect([...storage.files.keys()]).toEqual([`books/${hash}.pdf`]);
  });

  it('never stores the picked URI as the Book path', async () => {
    const result = await importPicked([{ name: 'Dune.pdf', webPath: 'content://docs/1' }]);
    if (!isOk(result)) throw new Error(result.error);
    expect(result.data.added[0].path.startsWith('content:')).toBe(false);
    const books = await library.listBooks();
    expect(books.ok && books.data.every((book) => !book.path.includes('content:'))).toBe(true);
  });

  it('reports the same PDF added a second time as already in the Library and leaves no extra file', async () => {
    await importPicked([{ name: 'Dune.pdf', webPath: 'content://docs/1' }]);
    const again = await importPicked([{ name: 'Copy of Dune.pdf', webPath: 'content://docs/1-again' }]);
    if (!isOk(again)) throw new Error(again.error);
    expect(again.data.added).toEqual([]);
    expect(again.data.alreadyInLibrary.map((book) => book.title)).toEqual(['Dune']);
    expect(storage.files.size).toBe(1);
    const books = await library.listBooks();
    expect(books.ok && books.data).toHaveLength(1);
  });

  it('counts the same PDF picked twice in one go once and cleans up the surplus copy', async () => {
    const result = await importPicked([
      { name: 'Dune.pdf', webPath: 'content://docs/1' },
      { name: 'Dune (1).pdf', webPath: 'content://docs/1-again' },
      { name: 'Emma.pdf', webPath: 'content://docs/2' },
    ]);
    if (!isOk(result)) throw new Error(result.error);
    expect(result.data.added.map((book) => book.title)).toEqual(['Dune', 'Emma']);
    expect([...storage.files.keys()].every((path) => path.startsWith('books/') && path.endsWith('.pdf'))).toBe(true);
    expect(storage.files.size).toBe(2);
  });

  it('skips a picked file that is not a PDF by name', async () => {
    const result = await importPicked([{ name: 'notes.txt', webPath: 'content://docs/1' }]);
    if (!isOk(result)) throw new Error(result.error);
    expect(result.data.skipped.map((skipped) => [skipped.fileName, skipped.reason])).toEqual([['notes.txt', 'not-pdf']]);
    expect(storage.files.size).toBe(0);
  });

  it('skips an unreadable file, removes its partial copy and still imports the rest', async () => {
    const session = createPickedPdfImport({
      picked: [
        { name: 'Broken.pdf', webPath: 'broken' },
        { name: 'Emma.pdf', webPath: 'content://docs/2' },
      ],
      storage,
      openStream: async (webPath) => {
        if (webPath === 'broken') throw new Error('permission denied');
        return streamOf(contents[webPath]);
      },
      generateId: () => 'run',
      log: (message) => logged.push(message),
    });
    const result = await library.importBooks({ paths: session.paths, fileSystem: session.fileSystem });
    if (!isOk(result)) throw new Error(result.error);
    expect(result.data.added.map((book) => book.title)).toEqual(['Emma']);
    expect(result.data.skipped.map((skipped) => skipped.fileName)).toEqual(['Broken.pdf']);
    expect(storage.files.size).toBe(1);
  });
});
