import { err, ok, type Result, type SyncStorage } from '@taking-book/core';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Implements SyncStorage over a local folder synced by a cloud drive
 * (Google Drive, OneDrive, Dropbox, etc.). The folder contains:
 * - manifest.json: the sync manifest
 * - blobs/<hash>: file content blobs keyed by content hash
 */
export function createSyncStorage(basePath: string): SyncStorage {
  return {
    async readFile(key: string): Promise<Result<Uint8Array | null>> {
      try {
        const fullPath = path.join(basePath, key);
        const data = await fs.readFile(fullPath);
        return ok(new Uint8Array(data.buffer));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return ok(null);
        return err(`Failed to read ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async writeFile(key: string, data: Uint8Array): Promise<Result<void>> {
      try {
        const fullPath = path.join(basePath, key);
        const dir = path.dirname(fullPath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(fullPath, Buffer.from(data));
        return ok(undefined);
      } catch (error) {
        return err(`Failed to write ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async deleteFile(key: string): Promise<Result<void>> {
      try {
        const fullPath = path.join(basePath, key);
        await fs.unlink(fullPath);
        return ok(undefined);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return ok(undefined);
        return err(`Failed to delete ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async listFiles(prefix: string): Promise<Result<string[]>> {
      try {
        const searchDir = path.join(basePath, prefix);
        const entries = await fs.readdir(searchDir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          if (entry.isFile()) {
            files.push(path.join(prefix, entry.name));
          }
        }
        return ok(files);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return ok([]);
        return err(`Failed to list ${prefix}: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}
