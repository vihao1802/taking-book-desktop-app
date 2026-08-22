import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import {
  computeReadingStats,
  createAnnotation,
  deleteAnnotation,
  deleteFile,
  getDailyReadingMinutes,
  getLastPosition,
  getTheme,
  isOk,
  listAnnotations,
  listFiles,
  recordReadingSession,
  saveLastPosition,
  setAnnotationNote,
  setFileFavorite,
  setFilePageCount,
  setFileStatus,
  setFileTags,
  setTheme,
  upsertFile,
} from '@taking-book/core';
import type { BookFile, BookStatus, CloudAccount, CreateAnnotationInput, ReadMode, Result, SqlDriver, SyncStamp } from '@taking-book/core';
import { basename, extname, join } from 'node:path';
import { copyFile, mkdir } from 'node:fs/promises';
import { sha256File } from './hash';
import {
  createCloudProvider,
  getDeviceId,
  getGoogleClientId,
  getGoogleClientSecret,
  localBlobDir,
  runSync,
} from './sync';

/**
 * IPC surface for the library, reader, settings, and cloud sync. Local edits
 * are stamped with the current device id so the LWW sync clock stays honest.
 */
export function registerIpc(db: SqlDriver): void {
  const userDataDir = app.getPath('userData');
  async function stamp(): Promise<SyncStamp> {
    return { updatedAt: Date.now(), updatedBy: await getDeviceId(db) };
  }

  async function cloudProvider(): Promise<Result<ReturnType<typeof createCloudProvider>>> {
    const clientId = await getGoogleClientId(db);
    if (!clientId) return { ok: false, error: 'No Google client id configured.' };
    const clientSecret = getGoogleClientSecret();
    return { ok: true, data: createCloudProvider(db, userDataDir, clientId, clientSecret) };
  }

  ipcMain.handle('files:open', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return { ok: false, error: 'No window to host the file dialog' };
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documents', extensions: ['pdf'] }],
    });
    if (canceled || filePaths.length === 0) return { ok: true, data: null };
    for (const filePath of filePaths) {
      if (extname(filePath).toLowerCase() !== '.pdf') {
        return { ok: false, error: `Only PDF files can be added to the library (skipped: ${basename(filePath)}).` };
      }
    }

    // Hash and copy in parallel — each import is I/O bound and independent.
    const blobDir = localBlobDir(app.getPath('userData'));
    await mkdir(blobDir, { recursive: true });
    const staged = await Promise.all(
      filePaths.map(async (filePath) => ({
        filePath,
        hash: await sha256File(filePath),
      })),
    );
    const files: BookFile[] = [];
    for (const item of staged) {
      try {
        await copyFile(item.filePath, join(blobDir, item.hash));
      } catch (error) {
        return {
          ok: false,
          error: `File could not be copied into the local store: ${errorMessage(error)}`,
        };
      }
      const registered = await upsertFile(db, { filePath: join(blobDir, item.hash), hash: item.hash, title: basename(item.filePath).replace(/\.[^.]+$/, '') }, await stamp());
      if (!isOk(registered)) return registered;
      files.push(registered.data);
    }
    return { ok: true, data: { files } };
  });

  ipcMain.handle('files:delete', async (_event, id: number) => {
    const result = await deleteFile(db, id, await stamp());
    if (!isOk(result)) return result;
    // Sync in the background: a slow or offline cloud must never delay or
    // fail the local delete; the next successful sync reconciles the
    // tombstone. No provider configured is a normal local-only setup.
    void (async () => {
      const provider = await cloudProvider();
      if (!isOk(provider)) return;
      const summary = await runSync(db, userDataDir, provider.data);
      if (!isOk(summary)) {
        console.error(`Background sync after deleting file ${id} failed: ${summary.error}`);
      }
    })();
    return { ok: true, data: undefined };
  });

  ipcMain.handle('files:last-position:get', (_event, id: number) => getLastPosition(db, id));

  ipcMain.handle(
    'files:last-position:set',
    async (_event, id: number, page: number, position: number, mode: ReadMode) =>
      saveLastPosition(db, id, { page, position, mode }, await stamp()),
  );

  ipcMain.handle('files:page-count:set', async (_event, id: number, pageCount: number) =>
    setFilePageCount(db, id, pageCount, await stamp()),
  );

  ipcMain.handle('files:list', () => listFiles(db));

  ipcMain.handle('files:status:set', async (_event, id: number, status: BookStatus) =>
    setFileStatus(db, id, status, await stamp()),
  );

  ipcMain.handle('files:tags:set', async (_event, id: number, tags: string[]) =>
    setFileTags(db, id, tags, await stamp()),
  );

  ipcMain.handle('files:favorite:set', async (_event, id: number, favorite: boolean) =>
    setFileFavorite(db, id, favorite, await stamp()),
  );

  ipcMain.handle('annotations:list', (_event, fileHash: string) => listAnnotations(db, fileHash));

  ipcMain.handle('annotations:create', async (_event, fileHash: string, input: CreateAnnotationInput) =>
    createAnnotation(db, fileHash, input, await stamp()),
  );

  ipcMain.handle('annotations:note:set', async (_event, id: number, note: string | null) =>
    setAnnotationNote(db, id, note, await stamp()),
  );

  ipcMain.handle('annotations:delete', async (_event, id: number) =>
    deleteAnnotation(db, id, await stamp()),
  );

  ipcMain.handle('sessions:record', (_event, fileId: number, minutes: number) =>
    recordReadingSession(db, fileId, localDay(new Date()), minutes),
  );

  ipcMain.handle('stats:get', async () => {
    const today = localDay(new Date());
    const days = 30;
    const daily = await getDailyReadingMinutes(db, days, today);
    if (!isOk(daily)) return daily;
    return { ok: true, data: computeReadingStats(daily.data, days, today) };
  });

  ipcMain.handle('settings:theme:get', () => getTheme(db));

  ipcMain.handle('settings:theme:set', (_event, theme: Parameters<typeof setTheme>[1]) =>
    setTheme(db, theme),
  );

  ipcMain.handle('cloud:status', async (): Promise<Result<CloudAccount | null>> => {
    const provider = await cloudProvider();
    if (!isOk(provider)) return provider;
    return provider.data.getAccount();
  });

  ipcMain.handle('cloud:connect', async (): Promise<Result<CloudAccount>> => {
    const provider = await cloudProvider();
    if (!isOk(provider)) return provider;
    return provider.data.connect();
  });

  ipcMain.handle('cloud:disconnect', async (): Promise<Result<void>> => {
    const provider = await cloudProvider();
    if (!isOk(provider)) return provider;
    return provider.data.disconnect();
  });

  ipcMain.handle('sync:run', async () => {
    const provider = await cloudProvider();
    if (!isOk(provider)) return provider;
    return runSync(db, userDataDir, provider.data);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Returns the local calendar day as YYYY-MM-DD for a given date. */
function localDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
