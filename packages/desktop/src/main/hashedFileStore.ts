import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HashedTextStore } from '@taking-book/core';

export interface HashedFileStoreOptions {
  dir: string;
  extension: string;
  /** Names the stored thing in error messages. */
  label: string;
  /** How the text maps to bytes on disk: 'base64' keeps binary files such as JPEG covers byte-identical. */
  encoding: 'utf8' | 'base64';
}

/**
 * Keeps one file per content hash in a directory under userData, so the core
 * library service can cache covers and reflow text without knowing about paths.
 */
export function createHashedFileStore(options: HashedFileStoreOptions): HashedTextStore {
  const { dir, extension, label, encoding } = options;
  const fileFor = (hash: string): string => join(dir, `${hash}.${extension}`);
  return {
    async read(hash) {
      try {
        return { ok: true, data: await readFile(fileFor(hash), encoding) };
      } catch (error) {
        if (isFileMissing(error)) return { ok: true, data: null };
        return { ok: false, error: `Failed to read ${label} for ${hash}: ${errorMessage(error)}` };
      }
    },
    async write(hash, text) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(fileFor(hash), text, encoding);
        return { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: `Failed to cache ${label} for ${hash}: ${errorMessage(error)}` };
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFileMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
