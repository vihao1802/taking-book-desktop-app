import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import {
  addCustomSounds,
  deleteCustomSound,
  listCustomSounds,
  renameCustomSound,
  type AddCustomSoundsSummary,
  type CustomSound,
  type CustomSoundFileSystem,
  type Result,
  type SqlDriver,
} from '@taking-book/core';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256File } from './hash';

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'flac'];
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Where the app keeps its own copies of Custom sound audio, one file per content hash. */
export function customSoundsDir(userDataDir: string): string {
  return join(userDataDir, 'custom-sounds');
}

/** The stored audio file for a Custom sound, or null when the hash is not a plausible content hash. */
export function customSoundFilePath(userDataDir: string, contentHash: string): string | null {
  return CONTENT_HASH_PATTERN.test(contentHash) ? join(customSoundsDir(userDataDir), contentHash) : null;
}

/** Node-backed file system for core's addCustomSounds, copying audio into the given store directory. */
export function createCustomSoundFileSystem(storeDir: string): CustomSoundFileSystem {
  return {
    async sizeOf(path) {
      return (await stat(path)).size;
    },
    hashFile: sha256File,
    async copyToStore(path, hash) {
      await mkdir(storeDir, { recursive: true });
      await copyFile(path, join(storeDir, hash));
    },
  };
}

/** IPC for listing, adding, renaming and deleting Custom sounds. They are device-local and never synced. */
export function registerCustomSoundsIpc(db: SqlDriver): void {
  const userDataDir = app.getPath('userData');

  ipcMain.handle('sounds:custom:list', (): Promise<Result<CustomSound[]>> => listCustomSounds(db));

  ipcMain.handle('sounds:custom:add', async (): Promise<Result<AddCustomSoundsSummary | null>> => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return { ok: false, error: 'No window to host the file dialog' };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
    });
    if (canceled || filePaths.length === 0) return { ok: true, data: null };
    const result = await addCustomSounds(db, { paths: filePaths, fileSystem: createCustomSoundFileSystem(customSoundsDir(userDataDir)) });
    if (!result.ok) {
      console.error(`Adding ${filePaths.length} Custom sound file(s) failed: ${result.error}`);
      return { ok: false, error: 'Sounds could not be added. Please try again.' };
    }
    for (const rejected of result.data.rejected) {
      if (rejected.detail) console.error(`Custom sound ${rejected.fileName} was rejected: ${rejected.detail}`);
    }
    return result;
  });

  ipcMain.handle('sounds:custom:rename', (_event, contentHash: unknown, name: unknown): Promise<Result<void>> => {
    if (typeof contentHash !== 'string' || typeof name !== 'string') return Promise.resolve({ ok: false, error: 'A sound and a name are required.' });
    return renameCustomSound(db, contentHash, name);
  });

  ipcMain.handle('sounds:custom:delete', async (_event, contentHash: unknown): Promise<Result<void>> => {
    if (typeof contentHash !== 'string') return { ok: false, error: 'A sound is required.' };
    const deleted = await deleteCustomSound(db, contentHash);
    if (!deleted.ok) return deleted;
    const filePath = customSoundFilePath(userDataDir, contentHash);
    if (filePath !== null) {
      // The row is already gone, so a leftover file only wastes space; log it rather than fail the delete.
      await rm(filePath, { force: true }).catch((error: unknown) => console.error(`Could not remove Custom sound file ${filePath}: ${error instanceof Error ? error.message : String(error)}`));
    }
    return deleted;
  });
}
