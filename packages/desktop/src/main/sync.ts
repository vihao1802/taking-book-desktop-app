import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { Result, SqlDriver, SyncSummary } from '@taking-book/core';
import { err, isOk, ok, syncLibrary, getSetting, setSetting, listFiles } from '@taking-book/core';
import { createFolderSyncStorage } from './syncStorage';
const DEVICE_KEY = 'deviceId';
const SYNC_FOLDER_KEY = 'syncFolder';

/**
 * Desktop glue for the core sync engine. The "cloud drive" is a plain folder
 * the user keeps synced via Dropbox/Google Drive/Nextcloud; our manifest and
 * content-addressed blobs live inside it. The local content store is a
 * `userData/blobs/<hash>` directory, so downloaded books are addressable by
 * hash and uploads read from a stable location regardless of the original file.
 */

/** Returns the persisted device id, creating one the first time. */
export async function getDeviceId(db: SqlDriver): Promise<string> {
  const existing = await getSetting(db, DEVICE_KEY);
  if (isOk(existing) && existing.data) return existing.data;
  const id = randomUUID();
  await setSetting(db, DEVICE_KEY, id);
  return id;
}

/** Returns the configured sync folder path, or null when none is set. */
export async function getSyncFolder(db: SqlDriver): Promise<Result<string | null>> {
  return getSetting(db, SYNC_FOLDER_KEY);
}

/** Persists the sync folder path. */
export async function setSyncFolder(db: SqlDriver, folder: string): Promise<Result<void>> {
  return setSetting(db, SYNC_FOLDER_KEY, folder);
}

/** Returns the local content-store directory (created on demand). */
export function localBlobDir(userDataDir: string): string {
  return path.join(userDataDir, 'blobs');
}

/**
 * Copies any live book whose content is missing from the local store into it,
 * reading from the file path recorded in the database. This lets books added
 * before the sync store existed still upload by content hash.
 */
export async function seedLocalBlobs(
  db: SqlDriver,
  blobDir: string,
): Promise<Result<number>> {
  const files = await listFiles(db);
  if (!isOk(files)) return files;
  let seeded = 0;
  for (const file of files.data) {
    const target = path.join(blobDir, file.hash);
    const stored = await fileExists(target);
    if (stored) continue;
    const sourceExists = await fileExists(file.path);
    if (!sourceExists) continue;
    try {
      await copyFile(file.path, target);
      seeded += 1;
    } catch (error) {
      return err(`Failed to seed blob for "${file.title}": ${errorMessage(error)}`);
    }
  }
  return ok(seeded);
}

async function fileExists(target: string): Promise<boolean> {
  try {
    const { access } = await import('node:fs/promises');
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs one sync pass against the configured folder. Fails with a clear message
 * when no folder is configured; the core engine guarantees a failed sync never
 * blocks reading or corrupts the local library.
 */
export async function runSync(
  db: SqlDriver,
  userDataDir: string,
): Promise<Result<SyncSummary>> {
  const folder = await getSyncFolder(db);
  if (!isOk(folder)) return folder;
  if (!folder.data) return err('No sync folder configured yet.');

  const blobDir = localBlobDir(userDataDir);
  const seeded = await seedLocalBlobs(db, blobDir);
  if (!isOk(seeded)) return seeded;

  return syncLibrary(db, {
    local: createFolderSyncStorage(userDataDir),
    remote: createFolderSyncStorage(folder.data),
    resolveLocalPath: (hash) => path.join(blobDir, hash),
    logWarning: (message) => console.warn(`[sync] ${message}`),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
