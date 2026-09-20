import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  computeReadingStats,
  createAnnotation,
  deleteAnnotation,
  deleteFile,
  deleteNote,
  getDailyReadingMinutes,
  getFileZoom,
  getLastPosition,
  getReadingMinutesByBook,
  getNotesSidebarWidth,
  getSidebarWidth,
  getTheme,
  isOk,
  listAnnotations,
  listFiles,
  listLibraryAnnotations,
  parseReflowCache,
  recordReadingSession,
  saveLastPosition,
  saveNoteDraft,
  saveNoteText,
  serializeReflowCache,
  setAnnotationColor,
  setFileFavorite,
  setFilePageCount,
  setFileStatus,
  setFileZoom,
  setFileTags,
  setFileTitle,
  setNotesSidebarWidth,
  setSidebarWidth,
  setTheme,
  upsertFile,
} from '@taking-book/core';
import type { AnnotationColor, BookFile, BookStatus, CloudAccount, CreateAnnotationInput, NoteDraft, ReadMode, ReflowCacheEntry, Result, SqlDriver, SyncStamp } from '@taking-book/core';
import { basename, extname, join } from 'node:path';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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

  ipcMain.handle('files:zoom:get', (_event, id: number, mode: ReadMode) => getFileZoom(db, id, mode));

  ipcMain.handle('files:zoom:set', async (_event, id: number, zoom: number, mode: ReadMode) =>
    setFileZoom(db, id, zoom, { mode, stamp: await stamp() }),
  );

  // Cover thumbnails are cached as JPEG files keyed by content hash so the
  // renderer can show them instantly on later launches instead of re-rendering
  // the PDF's first page every time.

  const coverFile = (hash: string) => join(app.getPath('userData'), 'covers', `${hash}.jpg`);

  ipcMain.handle('covers:get', async (_event, hash: string): Promise<Result<string | null>> => {
    try {
      const bytes = await readFile(coverFile(hash));
      return { ok: true, data: `data:image/jpeg;base64,${bytes.toString('base64')}` };
    } catch {
      return { ok: true, data: null };
    }
  });

  ipcMain.handle('covers:save', async (_event, hash: string, dataUrl: string): Promise<Result<void>> => {
    try {
      const base64 = dataUrl.split(',')[1];
      if (!base64) return { ok: true, data: undefined };
      await mkdir(join(app.getPath('userData'), 'covers'), { recursive: true });
      await writeFile(coverFile(hash), Buffer.from(base64, 'base64'));
      return { ok: true, data: undefined };
    } catch (error) {
      return { ok: false, error: `Failed to cache cover: ${errorMessage(error)}` };
    }
  });

  // Extracting a whole document for reflow costs one pdf.js round-trip per
  // page, so the finished result is cached as JSON keyed by content hash and
  // later opens skip extraction entirely. The cache is local-only (never
  // synced) and disposable: any read problem just means re-extracting.

  const reflowCacheFile = (hash: string) => join(app.getPath('userData'), 'reflow', `${hash}.json`);

  ipcMain.handle('reflow:get', async (_event, hash: string): Promise<Result<ReflowCacheEntry | null>> => {
    let json: string;
    try {
      json = await readFile(reflowCacheFile(hash), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, data: null };
      return { ok: false, error: `Failed to read reflow cache for ${hash}: ${errorMessage(error)}` };
    }
    const parsed = parseReflowCache(json);
    if (!isOk(parsed)) {
      console.error(`Discarding reflow cache for ${hash}: ${parsed.error}`);
      return { ok: true, data: null };
    }
    return parsed;
  });

  ipcMain.handle(
    'reflow:save',
    async (_event, hash: string, entry: ReflowCacheEntry): Promise<Result<void>> => {
      try {
        await mkdir(join(app.getPath('userData'), 'reflow'), { recursive: true });
        await writeFile(reflowCacheFile(hash), serializeReflowCache(entry));
        return { ok: true, data: undefined };
      } catch (error) {
        return { ok: false, error: `Failed to cache reflow text for ${hash}: ${errorMessage(error)}` };
      }
    },
  );

  ipcMain.handle('files:list', () => listFiles(db));

  ipcMain.handle('files:status:set', async (_event, id: number, status: BookStatus) =>
    setFileStatus(db, id, status, await stamp()),
  );

  ipcMain.handle('files:tags:set', async (_event, id: number, tags: string[]) =>
    setFileTags(db, id, tags, await stamp()),
  );

  ipcMain.handle('files:title:set', async (_event, id: number, title: string) =>
    setFileTitle(db, id, title, await stamp()),
  );

  ipcMain.handle('files:favorite:set', async (_event, id: number, favorite: boolean) =>
    setFileFavorite(db, id, favorite, await stamp()),
  );

  ipcMain.handle('annotations:list', (_event, fileHash: string) => listAnnotations(db, fileHash));

  ipcMain.handle('annotations:listLibrary', () => listLibraryAnnotations(db));

  ipcMain.handle('annotations:create', async (_event, fileHash: string, input: CreateAnnotationInput) =>
    createAnnotation(db, fileHash, input, { stamp: await stamp(), generateUid: randomUUID }),
  );

  ipcMain.handle('annotations:draft:save', async (_event, fileHash: string, draft: NoteDraft) =>
    saveNoteDraft(db, fileHash, draft, { stamp: await stamp(), generateUid: randomUUID }),
  );

  ipcMain.handle('annotations:note:save', async (_event, id: number, text: string) =>
    saveNoteText(db, id, text, await stamp()),
  );

  ipcMain.handle('annotations:note:delete', async (_event, id: number) =>
    deleteNote(db, id, await stamp()),
  );

  ipcMain.handle('annotations:color:set', async (_event, id: number, color: AnnotationColor) =>
    setAnnotationColor(db, id, color, await stamp()),
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
    const books = await getReadingMinutesByBook(db, days, today);
    if (!isOk(books)) return books;
    return { ok: true, data: computeReadingStats(daily.data, days, today, books.data) };
  });

  ipcMain.handle('settings:theme:get', () => getTheme(db));

  ipcMain.handle('settings:theme:set', (_event, theme: Parameters<typeof setTheme>[1]) =>
    setTheme(db, theme),
  );

  ipcMain.handle('settings:sidebarWidth:get', () => getSidebarWidth(db));

  ipcMain.handle('settings:sidebarWidth:set', (_event, width: number) =>
    setSidebarWidth(db, width),
  );

  ipcMain.handle('settings:notesSidebarWidth:get', () => getNotesSidebarWidth(db));

  ipcMain.handle('settings:notesSidebarWidth:set', (_event, width: number) =>
    setNotesSidebarWidth(db, width),
  );

  ipcMain.handle('window:fullscreen:get', (event): Result<boolean> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? { ok: true, data: win.isFullScreen() } : { ok: false, error: 'No window found.' };
  });

  ipcMain.handle('window:fullscreen:toggle', (event): Result<boolean> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: 'No window found.' };
    // setFullScreen applies asynchronously on some platforms, so return the
    // requested state rather than re-reading isFullScreen().
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return { ok: true, data: next };
  });

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
