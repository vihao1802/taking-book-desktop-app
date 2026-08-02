import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import {
  deleteFile,
  getLastPosition,
  getTheme,
  isOk,
  listFiles,
  saveLastPosition,
  setFileStatus,
  setFileTags,
  setTheme,
  upsertFile,
} from '@taking-book/core';
import type { BookStatus, SqlDriver, SyncStamp } from '@taking-book/core';
import { basename, join } from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';
import { sha256File } from './hash';
import { getDeviceId, getSyncFolder, localBlobDir, runSync, setSyncFolder } from './sync';

/**
 * IPC surface for the library, reader, settings, and sync. Local edits are
 * stamped with the current device id so the LWW sync clock stays honest.
 */
export function registerIpc(db: SqlDriver): void {
  async function stamp(): Promise<SyncStamp> {
    return { updatedAt: Date.now(), updatedBy: await getDeviceId(db) };
  }

  ipcMain.handle('files:open', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return { ok: false, error: 'No window to host the file dialog' };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: ['pdf'] }],
    });
    if (canceled || filePaths.length === 0) return { ok: true, data: null };
    const filePath = filePaths[0];
    const hash = await sha256File(filePath);
    const title = basename(filePath).replace(/\.[^.]+$/, '');

    // Register the book with a content-addressed copy in the local store so
    // its bytes are stable for sync regardless of the original location.
    const blobDir = localBlobDir(app.getPath('userData'));
    const blobPath = join(blobDir, hash);
    try {
      await mkdir(blobDir, { recursive: true });
      await copyFile(filePath, blobPath);
    } catch (error) {
      return {
        ok: false,
        error: `File could not be copied into the local store: ${errorMessage(error)}`,
      };
    }
    const registered = await upsertFile(db, { filePath: blobPath, hash, title }, await stamp());
    if (!isOk(registered)) return registered;
    return { ok: true, data: { file: registered.data } };
  });

  ipcMain.handle('files:delete', async (_event, id: number) => {
    const result = await deleteFile(db, id, await stamp());
    if (!isOk(result)) return result;
    await runSync(db, app.getPath('userData'));
    return { ok: true, data: undefined };
  });

  ipcMain.handle('files:last-position:get', (_event, id: number) => getLastPosition(db, id));

  ipcMain.handle('files:last-position:set', async (_event, id: number, page: number, position: number) =>
    saveLastPosition(db, id, page, position, await stamp()),
  );

  ipcMain.handle('files:list', () => listFiles(db));

  ipcMain.handle('files:status:set', async (_event, id: number, status: BookStatus) =>
    setFileStatus(db, id, status, await stamp()),
  );

  ipcMain.handle('files:tags:set', async (_event, id: number, tags: string[]) =>
    setFileTags(db, id, tags, await stamp()),
  );

  ipcMain.handle('settings:theme:get', () => getTheme(db));

  ipcMain.handle('settings:theme:set', (_event, theme: Parameters<typeof setTheme>[1]) =>
    setTheme(db, theme),
  );

  ipcMain.handle('sync:run', () => runSync(db, app.getPath('userData')));

  ipcMain.handle('settings:sync-folder:get', () => getSyncFolder(db));

  ipcMain.handle('settings:sync-folder:set', (_event, folder: string) => setSyncFolder(db, folder));

  ipcMain.handle('settings:sync-folder:choose', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return { ok: false, error: 'No window to host the folder dialog' };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return { ok: true, data: null };
    const folder = filePaths[0];
    const saved = await setSyncFolder(db, folder);
    if (!isOk(saved)) return saved;
    return { ok: true, data: folder };
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
