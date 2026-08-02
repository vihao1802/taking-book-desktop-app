import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Result, SyncStorage } from '@taking-book/core';
import { err, ok } from '@taking-book/core';

/**
 * Folder-backed SyncStorage. Keys map onto files verbatim: `manifest.json`
 * becomes `<root>/manifest.json` and `blobs/<hash>` becomes
 * `<root>/blobs/<hash>`. Both the local content store and the cloud-drive
 * folder use this same implementation. Writes are atomic (temp file + rename)
 * so a crash never leaves a partially-written manifest on the drive.
 */

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'ENOENT';
}

export function createFolderSyncStorage(root: string): SyncStorage {
  const keyPath = (key: string): string => {
    if (key.includes('..')) throw new Error(`Invalid sync key: ${key}`);
    return path.join(root, key);
  };

  async function readOrNull(file: string): Promise<Uint8Array | null> {
    try {
      return await readFile(file);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  return {
    async readFile(key): Promise<Result<Uint8Array | null>> {
      try {
        const data = await readOrNull(keyPath(key));
        return ok(data);
      } catch (error) {
        return err(`Failed reading "${key}" from ${root}: ${errorMessage(error)}`);
      }
    },

    async writeFile(key, data): Promise<Result<void>> {
      const target = keyPath(key);
      try {
        await mkdir(path.dirname(target), { recursive: true });
        const temp = `${target}.tmp-${process.pid}`;
        await writeFile(temp, data);
        await rename(temp, target);
        return ok(undefined);
      } catch (error) {
        return err(`Failed writing "${key}" to ${root}: ${errorMessage(error)}`);
      }
    },

    async deleteFile(key): Promise<Result<void>> {
      try {
        await rm(keyPath(key), { force: true });
        return ok(undefined);
      } catch (error) {
        return err(`Failed deleting "${key}" from ${root}: ${errorMessage(error)}`);
      }
    },

    async listFiles(prefix): Promise<Result<string[]>> {
      try {
        const dir = keyPath(prefix);
        const entries = await readdir(dir, { withFileTypes: true });
        return ok(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
      } catch (error) {
        if (isNotFound(error)) return ok([]);
        return err(`Failed listing "${prefix}" in ${root}: ${errorMessage(error)}`);
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
