import type { Result } from '../result';
import { ok } from '../result';
import type { DriveRestClient } from './driveRestClient';
import type { SyncStorage } from './types';

/** The Drive pieces {@link createGoogleDriveSyncStorage} maps onto. */
export interface GoogleDriveSyncStorageOptions {
  drive: DriveRestClient;
  /** Name of the app folder in the reader's Drive, e.g. `Taking Book`. */
  appFolderName: string;
}

/**
 * Maps the `manifest.json` and `blobs/<hash>` sync keys onto a Drive app
 * folder, so desktop and Android share one library through the same folder.
 *
 * @param options The Drive client and the app folder name.
 * @returns A sync storage over the folder; the folders are created on first use.
 */
export function createGoogleDriveSyncStorage(options: GoogleDriveSyncStorageOptions): SyncStorage {
  const { drive, appFolderName } = options;
  let rootFolderId: string | null = null;
  let blobsFolderId: string | null = null;

  async function rootFolder(): Promise<Result<string>> {
    if (rootFolderId) return ok(rootFolderId);
    const id = await drive.ensureFolder(appFolderName, null);
    if (!id.ok) return id;
    rootFolderId = id.data;
    return ok(id.data);
  }

  async function blobsFolder(): Promise<Result<string>> {
    if (blobsFolderId) return ok(blobsFolderId);
    const root = await rootFolder();
    if (!root.ok) return root;
    const id = await drive.ensureFolder('blobs', root.data);
    if (!id.ok) return id;
    blobsFolderId = id.data;
    return ok(id.data);
  }

  function splitKey(key: string): { folder: () => Promise<Result<string>>; name: string } {
    if (key === 'manifest.json') return { folder: rootFolder, name: 'manifest.json' };
    const name = key.startsWith('blobs/') ? key.slice('blobs/'.length) : key;
    return { folder: blobsFolder, name };
  }

  return {
    async readFile(key: string): Promise<Result<Uint8Array | null>> {
      const { folder, name } = splitKey(key);
      const folderResult = await folder();
      if (!folderResult.ok) return folderResult;
      return drive.downloadFile(folderResult.data, name);
    },
    async writeFile(key: string, data: Uint8Array): Promise<Result<void>> {
      const { folder, name } = splitKey(key);
      const folderResult = await folder();
      if (!folderResult.ok) return folderResult;
      return drive.uploadFile(folderResult.data, name, data);
    },
    async deleteFile(key: string): Promise<Result<void>> {
      const { folder, name } = splitKey(key);
      const folderResult = await folder();
      if (!folderResult.ok) return folderResult;
      return drive.deleteFile(folderResult.data, name);
    },
    async listFiles(prefix: string): Promise<Result<string[]>> {
      const { folder, name } = splitKey(prefix);
      const folderResult = await folder();
      if (!folderResult.ok) return folderResult;
      const names = await drive.listFiles(folderResult.data);
      if (!names.ok) return names;
      if (name && name !== 'blobs') return ok(names.data.filter((entry) => entry.startsWith(name)));
      return ok(names.data.map((entry) => (prefix === 'blobs/' ? `blobs/${entry}` : entry)));
    },
  };
}
