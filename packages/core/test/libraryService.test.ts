import { beforeEach, describe, expect, it } from 'vitest';
import {
  REFLOW_CACHE_VERSION,
  createLibraryService,
  err,
  isOk,
  ok,
  startDatabase,
  upsertFile,
  type BookFile,
  type HashedTextStore,
  type LibraryService,
  type SqlDriver,
} from '../src';
import { createMemoryDriver } from './helpers';

function createMemoryStore(): HashedTextStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    read: async (hash) => ok(entries.get(hash) ?? null),
    write: async (hash, text) => {
      entries.set(hash, text);
      return ok(undefined);
    },
  };
}

describe('createLibraryService', () => {
  let db: SqlDriver;
  let service: LibraryService;
  let covers: ReturnType<typeof createMemoryStore>;
  let reflow: ReturnType<typeof createMemoryStore>;
  let bookId: number;
  let logged: string[];

  beforeEach(async () => {
    db = createMemoryDriver();
    await startDatabase(db);
    covers = createMemoryStore();
    reflow = createMemoryStore();
    logged = [];
    service = createLibraryService(db, {
      getDeviceId: async () => 'device-a',
      coverStore: covers,
      reflowStore: reflow,
      now: () => 5000,
      log: (message) => logged.push(message),
    });
    const upserted = await upsertFile(db, { hash: 'h1', title: 'Book', filePath: '/b.pdf' });
    if (!isOk(upserted)) throw new Error(upserted.error);
    const books = await service.listBooks();
    if (!isOk(books)) throw new Error(books.error);
    bookId = books.data[0].id;
  });

  async function onlyBook(): Promise<BookFile> {
    const books = await service.listBooks();
    if (!isOk(books)) throw new Error(books.error);
    return books.data[0];
  }

  it('lists the Books in the library', async () => {
    expect((await onlyBook()).title).toBe('Book');
  });

  it('changes status, tags, title and favorite', async () => {
    await service.setStatus(bookId, 'finished');
    await service.setTags(bookId, ['a', 'b']);
    await service.setTitle(bookId, 'New title');
    await service.setFavorite(bookId, true);
    expect(await onlyBook()).toMatchObject({ status: 'finished', tags: ['a', 'b'], title: 'New title', favorite: true });
  });

  it('stamps edits with the device id and time so sync can order them', async () => {
    await service.setTitle(bookId, 'Stamped');
    const row = await db.get('SELECT updated_at, updated_by FROM files WHERE id = ?', [bookId]);
    expect(row).toMatchObject({ updated_at: 5000, updated_by: 'device-a' });
  });

  it('saves and reads the Last-read position', async () => {
    expect(await service.getLastPosition(bookId)).toEqual(ok(null));
    await service.saveLastPosition(bookId, { page: 4, position: 0.5, mode: 'reflow' });
    expect(await service.getLastPosition(bookId)).toEqual(ok({ page: 4, position: 0.5, mode: 'reflow' }));
  });

  it('keeps a separate zoom for each mode', async () => {
    await service.setZoom(bookId, 1.5, 'page');
    await service.setZoom(bookId, 2, 'reflow');
    expect(await service.getZoom(bookId, 'page')).toEqual(ok(1.5));
    expect(await service.getZoom(bookId, 'reflow')).toEqual(ok(2));
  });

  it('records the page count', async () => {
    await service.setPageCount(bookId, 120);
    expect((await onlyBook()).pageCount).toBe(120);
  });

  it('deletes a Book from the library', async () => {
    expect(await service.deleteBook(bookId)).toEqual(ok(undefined));
    const books = await service.listBooks();
    expect(isOk(books) && books.data).toEqual([]);
  });

  it('reports a failure to delete as an error result', async () => {
    await db.exec('DROP TABLE files');
    expect((await service.deleteBook(bookId)).ok).toBe(false);
  });

  describe('covers', () => {
    it('returns null when no cover is stored', async () => {
      expect(await service.getCover('h1')).toEqual(ok(null));
    });

    it('stores the base64 payload and returns it as a data URL', async () => {
      await service.saveCover('h1', 'data:image/jpeg;base64,QUJD');
      expect(covers.entries.get('h1')).toBe('QUJD');
      expect(await service.getCover('h1')).toEqual(ok('data:image/jpeg;base64,QUJD'));
    });

    it('ignores a cover without a payload', async () => {
      expect(await service.saveCover('h1', 'data:image/jpeg;base64,')).toEqual(ok(undefined));
      expect(covers.entries.size).toBe(0);
    });

    it('treats an unreadable cover as a miss and logs why', async () => {
      const failing = createLibraryService(db, {
        getDeviceId: async () => 'd',
        coverStore: { read: async () => err('disk gone'), write: async () => err('disk gone') },
        reflowStore: reflow,
        log: (message) => logged.push(message),
      });
      expect(await failing.getCover('h1')).toEqual(ok(null));
      expect(logged).toEqual(['disk gone']);
      expect(await failing.saveCover('h1', 'data:image/jpeg;base64,QUJD')).toEqual(err('disk gone'));
    });
  });

  describe('reflow cache', () => {
    const entry = { paragraphs: [], pageTexts: ['one'] };

    it('is a miss when nothing is stored', async () => {
      expect(await service.getReflowCache('h1')).toEqual(ok(null));
    });

    it('round-trips an entry', async () => {
      await service.saveReflowCache('h1', entry);
      expect(await service.getReflowCache('h1')).toEqual(ok(entry));
    });

    it('treats an entry from another cache version as a miss', async () => {
      reflow.entries.set('h1', JSON.stringify({ version: REFLOW_CACHE_VERSION + 1, ...entry }));
      expect(await service.getReflowCache('h1')).toEqual(ok(null));
    });

    it('discards a corrupt entry with a log line instead of failing', async () => {
      reflow.entries.set('h1', '{not json');
      expect(await service.getReflowCache('h1')).toEqual(ok(null));
      expect(logged).toHaveLength(1);
      expect(logged[0]).toContain('h1');
    });
  });
});
