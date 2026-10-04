import { Directory, Filesystem } from '@capacitor/filesystem';
import { err, ok, type Result, type SyncStorage } from '@taking-book/core';
import { base64ToBytes } from './base64-to-bytes';
import { BOOK_FOLDER, bookPathFor } from './capacitor-book-storage';
import { bytesToBase64 } from './bytes-to-base64';

const BLOB_PREFIX = 'blobs/';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFileMissing(error: unknown): boolean {
  return /does not exist|no such file|not found/i.test(errorMessage(error));
}

/** Maps a sync key `blobs/<hash>` to the Book's file in the app data folder. */
function pathForKey(key: string): string | null {
  return key.startsWith(BLOB_PREFIX) ? bookPathFor(key.slice(BLOB_PREFIX.length)) : null;
}

/**
 * The device's side of the sync: Books kept in the app data folder, one file
 * per content hash, addressed as `blobs/<hash>` like the Drive side.
 *
 * @returns A sync storage over the Books folder; keys other than `blobs/<hash>` hold nothing.
 */
export function createBookSyncStorage(): SyncStorage {
  return {
    async readFile(key): Promise<Result<Uint8Array | null>> {
      const path = pathForKey(key);
      if (path === null) return ok(null);
      try {
        const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
        return ok(typeof data === 'string' ? base64ToBytes(data) : null);
      } catch (error) {
        if (isFileMissing(error)) return ok(null);
        return err(`Could not read ${path}: ${errorMessage(error)}`);
      }
    },
    async statFile(key): Promise<Result<{ size: number } | null>> {
      const path = pathForKey(key);
      if (path === null) return ok(null);
      try {
        const { size } = await Filesystem.stat({ path, directory: Directory.Data });
        return ok({ size });
      } catch (error) {
        if (isFileMissing(error)) return ok(null);
        return err(`Could not check ${path}: ${errorMessage(error)}`);
      }
    },
    async writeFile(key, data): Promise<Result<void>> {
      const path = pathForKey(key);
      if (path === null) return err(`Cannot store ${key} on this device`);
      try {
        await Filesystem.writeFile({ path, data: bytesToBase64(data), directory: Directory.Data, recursive: true });
        return ok(undefined);
      } catch (error) {
        return err(`Could not write ${path}: ${errorMessage(error)}`);
      }
    },
    async deleteFile(key): Promise<Result<void>> {
      const path = pathForKey(key);
      if (path === null) return ok(undefined);
      try {
        await Filesystem.deleteFile({ path, directory: Directory.Data });
        return ok(undefined);
      } catch (error) {
        return isFileMissing(error) ? ok(undefined) : err(`Could not delete ${path}: ${errorMessage(error)}`);
      }
    },
    async listFiles(prefix): Promise<Result<string[]>> {
      if (!prefix.startsWith(BLOB_PREFIX)) return ok([]);
      try {
        const { files } = await Filesystem.readdir({ path: BOOK_FOLDER, directory: Directory.Data });
        return ok(files.map((file) => `${BLOB_PREFIX}${file.name.replace(/\.pdf$/, '')}`).filter((key) => key.startsWith(prefix)));
      } catch (error) {
        return isFileMissing(error) ? ok([]) : err(`Could not list the Books folder: ${errorMessage(error)}`);
      }
    },
  };
}
