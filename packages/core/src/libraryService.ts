import {
  deleteFile,
  getFileZoom,
  getLastPosition,
  listFiles,
  saveLastPosition,
  setFileFavorite,
  setFilePageCount,
  setFileStatus,
  setFileTags,
  setFileTitle,
  setFileZoom,
} from './filesRepository';
import type { BookFile, BookStatus, LastPosition, ReadMode } from './models';
import { parseReflowCache, serializeReflowCache, type ReflowCacheEntry } from './reflowCache';
import { isOk, ok, type Result } from './result';
import type { SqlDriver } from './sql';
import type { SyncStamp } from './sync/types';

/**
 * Where a platform keeps small disposable files keyed by content hash (covers,
 * reflow text). Reads return null for "not stored"; failures are errors.
 */
export interface HashedTextStore {
  read(hash: string): Promise<Result<string | null>>;
  write(hash: string, text: string): Promise<Result<void>>;
}

export interface LibraryServiceOptions {
  /** Supplies the id of this device, so every local edit is stamped for the LWW sync clock. */
  getDeviceId: () => Promise<string>;
  /** Holds each cover as base64 JPEG bytes. */
  coverStore: HashedTextStore;
  /** Holds each reflow cache entry as serialized JSON. */
  reflowStore: HashedTextStore;
  /** Current time in milliseconds; injectable for tests. */
  now?: () => number;
  /** Reports problems that are handled (for example a discarded corrupt cache). */
  log?: (message: string) => void;
}

/** The database-backed library operations of the reader API. */
export interface LibraryService {
  listBooks(): Promise<Result<BookFile[]>>;
  setStatus(id: number, status: BookStatus): Promise<Result<void>>;
  setTags(id: number, tags: string[]): Promise<Result<void>>;
  setTitle(id: number, title: string): Promise<Result<void>>;
  setFavorite(id: number, favorite: boolean): Promise<Result<void>>;
  deleteBook(id: number): Promise<Result<void>>;
  getLastPosition(id: number): Promise<Result<LastPosition | null>>;
  saveLastPosition(id: number, position: LastPosition): Promise<Result<void>>;
  getZoom(id: number, mode: ReadMode): Promise<Result<number | null>>;
  setZoom(id: number, zoom: number, mode: ReadMode): Promise<Result<void>>;
  setPageCount(id: number, pageCount: number): Promise<Result<void>>;
  getCover(hash: string): Promise<Result<string | null>>;
  saveCover(hash: string, dataUrl: string): Promise<Result<void>>;
  getReflowCache(hash: string): Promise<Result<ReflowCacheEntry | null>>;
  saveReflowCache(hash: string, entry: ReflowCacheEntry): Promise<Result<void>>;
}

const COVER_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/**
 * Creates the library service over a database and the platform's small stores.
 * Every write is stamped with the device id and current time.
 *
 * @param db The started database.
 * @param options Device id source, cover and reflow stores, and test seams.
 * @returns The operations desktop IPC handlers and mobile glue call into.
 */
export function createLibraryService(db: SqlDriver, options: LibraryServiceOptions): LibraryService {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((): void => undefined);

  async function stamp(): Promise<SyncStamp> {
    return { updatedAt: now(), updatedBy: await options.getDeviceId() };
  }

  return {
    listBooks: () => listFiles(db),
    setStatus: async (id, status) => setFileStatus(db, id, status, await stamp()),
    setTags: async (id, tags) => setFileTags(db, id, tags, await stamp()),
    setTitle: async (id, title) => setFileTitle(db, id, title, await stamp()),
    setFavorite: async (id, favorite) => setFileFavorite(db, id, favorite, await stamp()),
    deleteBook: async (id) => {
      const deleted = await deleteFile(db, id, await stamp());
      return isOk(deleted) ? ok(undefined) : deleted;
    },
    getLastPosition: (id) => getLastPosition(db, id),
    saveLastPosition: async (id, position) => saveLastPosition(db, id, position, await stamp()),
    getZoom: (id, mode) => getFileZoom(db, id, mode),
    setZoom: async (id, zoom, mode) => setFileZoom(db, id, zoom, { mode, stamp: await stamp() }),
    setPageCount: async (id, pageCount) => setFilePageCount(db, id, pageCount, await stamp()),
    getCover: async (hash) => {
      const stored = await options.coverStore.read(hash);
      if (!isOk(stored)) {
        // A cover is re-rendered from the PDF when missing, so an unreadable one is a miss, not a Library error.
        log(stored.error);
        return ok(null);
      }
      if (stored.data === null) return ok(null);
      return ok(`${COVER_DATA_URL_PREFIX}${stored.data}`);
    },
    saveCover: async (hash, dataUrl) => {
      const base64 = dataUrl.split(',')[1];
      // A cover without a payload is not worth failing the Library over.
      if (!base64) return ok(undefined);
      return options.coverStore.write(hash, base64);
    },
    getReflowCache: async (hash) => {
      const stored = await options.reflowStore.read(hash);
      if (!isOk(stored)) return stored;
      if (stored.data === null) return ok(null);
      const parsed = parseReflowCache(stored.data);
      if (isOk(parsed)) return parsed;
      // The cache is disposable, so a corrupt entry just means re-extracting.
      log(`Discarding reflow cache for ${hash}: ${parsed.error}`);
      return ok(null);
    },
    saveReflowCache: (hash, entry) => options.reflowStore.write(hash, serializeReflowCache(entry)),
  };
}
