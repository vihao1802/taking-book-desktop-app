import { beforeEach, describe, expect, it } from 'vitest';
import { startDatabase, upsertFile, type SqlDriver } from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';
import type { BookFiles } from './book-files';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';
import { createFakeConnection } from './fake-sqlite-connection';
import { createMobileReaderApi, createMobileServices } from './mobile-reader-api';

async function openDatabase(): Promise<SqlDriver> {
  const db = createCapacitorSqlDriver(createFakeConnection());
  await startDatabase(db);
  return db;
}

function createApi(db: SqlDriver): ReaderApi {
  let nextUid = 0;
  const services = createMobileServices(db, {
    deviceId: 'phone',
    generateUid: () => `uid-${nextUid++}`,
    systemLocale: 'en-GB',
    coverStore: { read: async () => ({ ok: true, data: null }), write: async () => ({ ok: true, data: undefined }) },
    reflowStore: { read: async () => ({ ok: true, data: null }), write: async () => ({ ok: true, data: undefined }) },
  });
  const bookFiles: BookFiles = {
    addFromPicker: async () => ({ ok: true, data: null }),
    checkReadable: async () => ({ ok: true, data: undefined }),
    getDocumentUrl: (storedPath) => `http://localhost/_capacitor_file_/data/${storedPath}`,
  };
  return createMobileReaderApi(services, bookFiles);
}

describe('createMobileReaderApi', () => {
  let db: SqlDriver;
  let api: ReaderApi;

  beforeEach(async () => {
    db = await openDatabase();
    api = createApi(db);
  });

  it('keeps every capability off', () => {
    expect(Object.values(api.capabilities).every((enabled) => !enabled)).toBe(true);
  });

  it('opens the picker, serves stored Books by URL and checks they are readable', async () => {
    expect(await api.openFile()).toEqual({ ok: true, data: null });
    expect(api.getDocumentUrl('books/abc.pdf')).toBe('http://localhost/_capacitor_file_/data/books/abc.pdf');
    expect(await api.checkFileReadable('books/abc.pdf')).toEqual({ ok: true, data: undefined });
  });

  it('saves the Theme to the database so a second start sees it', async () => {
    await api.setTheme('sepia');
    const restarted = createApi(db);
    expect(await restarted.getTheme()).toEqual({ ok: true, data: 'sepia' });
  });

  it('defaults the Target language from the system locale', async () => {
    expect(await api.getTargetLanguage()).toEqual({ ok: true, data: 'en' });
  });

  it('lists and edits Books through the library service', async () => {
    const upserted = await upsertFile(db, { hash: 'abc', title: 'Dune', filePath: '/books/abc.pdf' }, { updatedAt: 1, updatedBy: 'phone' });
    expect(upserted.ok).toBe(true);
    const listed = await api.listFiles();
    expect(listed.ok && listed.data.map((book) => book.title)).toEqual(['Dune']);
    if (!listed.ok) return;
    await api.setFileFavorite(listed.data[0].id, true);
    await api.saveLastPosition(listed.data[0].id, 3, 0.5, 'page');
    const position = await api.getLastPosition(listed.data[0].id);
    expect(position).toEqual({ ok: true, data: { page: 3, position: 0.5, mode: 'page' } });
  });

  it('returns an error result, never a throw, when the database fails', async () => {
    const broken: SqlDriver = {
      exec: () => Promise.reject(new Error('disk I/O error')),
      run: () => Promise.reject(new Error('disk I/O error')),
      get: () => Promise.reject(new Error('disk I/O error')),
      all: () => Promise.reject(new Error('disk I/O error')),
      transaction: () => Promise.reject(new Error('disk I/O error')),
    };
    const failing = createApi(broken);
    const results = await Promise.all([
      failing.listFiles(),
      failing.getTheme(),
      failing.setTheme('dark'),
      failing.listLibraryAnnotations(),
      failing.recordReadingSession(1, 5),
    ]);
    for (const result of results) expect(result.ok).toBe(false);
  });
});
