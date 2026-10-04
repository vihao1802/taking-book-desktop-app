import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { HashedTextStore } from '@taking-book/core';

export interface FilesystemTextStoreOptions {
  /** Folder under the app's private data directory. */
  folder: string;
  extension: string;
  /** Names the stored thing in error messages. */
  label: string;
  /** 'base64' keeps binary files such as JPEG covers byte-identical; 'utf8' stores readable text. */
  encoding: 'utf8' | 'base64';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFileMissing(error: unknown): boolean {
  return /does not exist|no such file|not found/i.test(errorMessage(error));
}

/**
 * Keeps one file per content hash in the app's private storage, so the core
 * library service can cache covers and reflow text without knowing about paths.
 *
 * @param options Where and how to store the files.
 * @returns A store whose reads return null for "not stored" and an error for real failures.
 */
export function createFilesystemTextStore(options: FilesystemTextStoreOptions): HashedTextStore {
  const { folder, extension, label, encoding } = options;
  const pathFor = (hash: string): string => `${folder}/${hash}.${extension}`;
  const fileEncoding = encoding === 'utf8' ? Encoding.UTF8 : undefined;
  return {
    async read(hash) {
      try {
        const file = await Filesystem.readFile({ path: pathFor(hash), directory: Directory.Data, encoding: fileEncoding });
        return { ok: true, data: typeof file.data === 'string' ? file.data : await file.data.text() };
      } catch (error) {
        if (isFileMissing(error)) return { ok: true, data: null };
        return { ok: false, error: `Failed to read ${label} for ${hash}: ${errorMessage(error)}` };
      }
    },
    async write(hash, text) {
      try {
        await Filesystem.writeFile({ path: pathFor(hash), directory: Directory.Data, data: text, encoding: fileEncoding, recursive: true });
        return { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: `Failed to cache ${label} for ${hash}: ${errorMessage(error)}` };
      }
    },
  };
}
