import type { ImportFileSystem } from '@taking-book/core';
import { copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256File } from './hash';

/** Node-backed file system for core's importBooks, copying Books into the given blob store directory. */
export function createImportFileSystem(blobDir: string): ImportFileSystem {
  return {
    async stat(path) {
      return (await stat(path)).isDirectory() ? 'directory' : 'file';
    },
    hashFile: sha256File,
    async copyToStore(path, hash) {
      const storedPath = join(blobDir, hash);
      await copyFile(path, storedPath);
      return storedPath;
    },
  };
}
