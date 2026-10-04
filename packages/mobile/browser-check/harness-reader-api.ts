import { ok, type Result } from '@taking-book/core';
import type { BookFile, BookStatus, LastPosition, ReaderApi, ReadMode } from '@taking-book/renderer';
import { createInMemoryReaderApi } from '../src/in-memory-reader-api';

const FIXTURE_URL = '/fixture.pdf';

function done<T>(data: T): Promise<Result<T>> {
  return Promise.resolve(ok(data));
}

function createFixtureBook(): BookFile {
  return {
    id: 1,
    hash: 'fixture-hash',
    path: 'fixture.pdf',
    title: 'fixture',
    status: 'unread',
    tags: [],
    favorite: false,
    lastPage: null,
    lastPosition: null,
    lastMode: 'page',
    pageCount: null,
    zoom: null,
    reflowZoom: null,
    lastReadAt: null,
    createdAt: '2026-01-01 00:00:00',
  };
}

/**
 * A reader API for checking the shared renderer in a plain browser: the Android
 * app's capabilities, with a Library holding one fixture Book kept in memory.
 * The Library edits, the saved position and the zoom of each reader mode work;
 * everything else is the in-memory API's.
 */
export function createHarnessReaderApi(): ReaderApi {
  let book = createFixtureBook();
  let lastPosition: LastPosition | null = null;
  const zooms: Record<ReadMode, number | null> = { page: null, reflow: null };
  const update = (changes: Partial<BookFile>): Promise<Result<void>> => {
    book = { ...book, ...changes };
    return done(undefined);
  };

  return {
    ...createInMemoryReaderApi(),
    getDocumentUrl: () => FIXTURE_URL,
    listFiles: () => done([book]),
    setFileStatus: (_id: number, status: BookStatus) => update({ status }),
    setFileTags: (_id: number, tags: string[]) => update({ tags }),
    setFileTitle: (_id: number, title: string) => update({ title }),
    setFileFavorite: (_id: number, favorite: boolean) => update({ favorite }),
    setFilePageCount: (_id: number, pageCount: number) => update({ pageCount }),
    getFileZoom: (_id: number, mode: ReadMode) => done(zooms[mode]),
    setFileZoom: (_id: number, zoom: number, mode: ReadMode) => {
      zooms[mode] = zoom;
      return done(undefined);
    },
    getLastPosition: () => done(lastPosition),
    saveLastPosition: (_id: number, page: number, position: number, mode: ReadMode) => {
      lastPosition = { page, position, mode };
      return update({ lastPage: page, lastPosition: position, lastMode: mode, lastReadAt: Date.now() });
    },
    deleteFile: () => update({}),
  };
}
