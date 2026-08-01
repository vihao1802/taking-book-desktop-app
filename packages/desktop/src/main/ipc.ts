import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
  getSetting,
  getLastPosition,
  getTheme,
  isOk,
  listFiles,
  saveLastPosition,
  setFileStatus,
  setFileTags,
  setSetting,
  setTheme,
  syncLibrary,
  upsertFile,
} from '@taking-book/core';
import type { BookStatus, SqlDriver } from '@taking-book/core';
import { basename } from 'node:path';
import { sha256File } from './hash';
import { createSyncStorage } from './syncStorage';

export function registerIpc(db: SqlDriver): void {
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
    const result = await upsertFile(db, { filePath, hash, title });
    if (!isOk(result)) return result;
    return { ok: true, data: { file: result.data } };
  });

  ipcMain.handle('files:last-position:get', (_event, id: number) => getLastPosition(db, id));

  ipcMain.handle('files:last-position:set', (_event, id: number, page: number, position: number) =>
    saveLastPosition(db, id, page, position),
  );

  ipcMain.handle('files:list', () => listFiles(db));

  ipcMain.handle('files:status:set', (_event, id: number, status: BookStatus) =>
    setFileStatus(db, id, status),
  );

  ipcMain.handle('files:tags:set', (_event, id: number, tags: string[]) =>
    setFileTags(db, id, tags),
  );

  ipcMain.handle('settings:theme:get', () => getTheme(db));

  ipcMain.handle('settings:theme:set', (_event, theme: Parameters<typeof setTheme>[1]) =>
    setTheme(db, theme),
  );

  ipcMain.handle('settings:sync-folder:get', () => getSetting(db, 'sync_folder'));

  ipcMain.handle('settings:sync-folder:set', async (_event, folderPath: string) => {
    const result = await setSetting(db, 'sync_folder', folderPath);
    return result;
  });

  ipcMain.handle('sync:run', async () => {
    const folderResult = await getSetting(db, 'sync_folder');
    if (!folderResult.ok) return folderResult;
    const folderPath = folderResult.data;
    if (!folderPath) return { ok: false, error: 'Sync folder not configured' };

    const local = createSyncStorage(folderPath);
    const remote = createSyncStorage(folderPath);

    const syncResult = await syncLibrary(db, {
      local,
      remote,
      resolveLocalPath: async (hash) => {
        const rowResult = await db.get('SELECT path FROM files WHERE hash = ?', [hash]);
        if (!rowResult) return '';
        return String((rowResult as { path: string }).path);
      },
      logWarning: (message) => console.warn('[sync]', message),
    });
    return syncResult;
  });
}
