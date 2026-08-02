import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { CloudProvider, Result, SqlDriver, SyncSummary } from '@taking-book/core';
import { err, isOk, ok, syncLibrary, getSetting, setSetting, listFiles } from '@taking-book/core';
import { createGoogleDriveProvider } from './cloud/googleDrive';
import { createCloudTokenStore } from './cloud/tokenStore';
import { createFolderSyncStorage } from './syncStorage';

const DEVICE_KEY = 'deviceId';
const CLIENT_ID_KEY = 'googleDriveClientId';
const DEFAULT_CLIENT_ID = '600959561990-on63p5pa0pn27njohftcd0nl326c4alj.apps.googleusercontent.com';

/**
 * Desktop glue for the core sync engine. The remote is a cloud provider (the
 * Google Drive REST API today); the local content store is a
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

/** Returns the Google OAuth client id, or null when none is configured. */
export async function getGoogleClientId(db: SqlDriver): Promise<string | null> {
  const fromEnv = process.env.TB_GDRIVE_CLIENT_ID;
  if (fromEnv) return fromEnv;
  const stored = await getSetting(db, CLIENT_ID_KEY);
  if (isOk(stored) && stored.data) return stored.data;
  return DEFAULT_CLIENT_ID;
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
export async function seedLocalBlobs(db: SqlDriver, blobDir: string): Promise<Result<number>> {
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

/** Builds the Google Drive provider for the given client id. */
export function createCloudProvider(
  db: SqlDriver,
  userDataDir: string,
  clientId: string,
): CloudProvider {
  const tokenStore = createCloudTokenStore(db);
  return createGoogleDriveProvider({
    clientId,
    tokenStore,
    openExternal: (url) => import('electron').then(({ shell }) => shell.openExternal(url)),
  });
}

/**
 * Runs one sync pass against the connected cloud provider. Fails with a clear
 * message when no provider is connected; the core engine guarantees a failed
 * sync never blocks reading or corrupts the local library.
 */
export async function runSync(
  db: SqlDriver,
  userDataDir: string,
  provider: CloudProvider,
): Promise<Result<SyncSummary>> {
  const storage = await provider.createSyncStorage();
  if (!isOk(storage)) return storage;

  const blobDir = localBlobDir(userDataDir);
  const seeded = await seedLocalBlobs(db, blobDir);
  if (!isOk(seeded)) return seeded;

  return syncLibrary(db, {
    local: createFolderSyncStorage(userDataDir),
    remote: storage.data,
    resolveLocalPath: (hash) => path.join(blobDir, hash),
    logWarning: (message) => console.warn(`[sync] ${message}`),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
