import { BrowserWindow, dialog, ipcMain } from 'electron';
import {
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
import type { BookStatus, SqlDriver } from '@taking-book/core';
import { basename } from 'node:path';
import { sha256File } from './hash';

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
}
