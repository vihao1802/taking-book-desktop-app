import { ok, type Result } from '@taking-book/core';
import type { BookFile, BookStatus, CloudAccount, DeviceCodePrompt, LastPosition, ReaderApi, ReadMode, SyncSummary } from '@taking-book/renderer';
import { createInMemoryReaderApi } from '../src/in-memory-reader-api';

const FIXTURE_URL = '/fixture.pdf';
const SIGN_IN_PROMPT: DeviceCodePrompt = { userCode: 'ABCD-EFGH', verificationUrl: 'https://www.google.com/device', expiresAt: 0 };
const SIGNED_IN_ACCOUNT: CloudAccount = { providerId: 'google-drive', displayName: 'Reader', email: 'reader@example.com' };
// The name of the function on `window` that a check calls to approve the pending sign-in, as the reader does on Google's page.
const APPROVE_SIGN_IN_HOOK = '__approveSignIn';
// Adds a Book to the Library and reports an automatic sync, as the app does when it syncs by itself.
const AUTO_SYNC_HOOK = '__runAutoSync';

function done<T>(data: T): Promise<Result<T>> {
  return Promise.resolve(ok(data));
}

function createFixtureBook(): BookFile {
  return {
    id: 1,
    hash: 'fixture-hash',
    path: 'fixture.pdf',
    title: 'fixture',
    status: 'unread',
    tags: [],
    favorite: false,
    lastPage: null,
    lastPosition: null,
    lastMode: 'page',
    pageCount: null,
    zoom: null,
    reflowZoom: null,
    lastReadAt: null,
    createdAt: '2026-01-01 00:00:00',
  };
}

/**
 * A reader API for checking the shared renderer in a plain browser: the Android
 * app's capabilities, with a Library holding one fixture Book kept in memory.
 * The Library edits, the saved position and the zoom of each reader mode work;
 * everything else is the in-memory API's.
 */
export function createHarnessReaderApi(): ReaderApi {
  let book = createFixtureBook();
  let lastPosition: LastPosition | null = null;
  const zooms: Record<ReadMode, number | null> = { page: null, reflow: null };
  const update = (changes: Partial<BookFile>): Promise<Result<void>> => {
    book = { ...book, ...changes };
    return done(undefined);
  };

  let account: CloudAccount | null = null;
  let syncedBooks: BookFile[] = [];
  let downloadOverMobileData = false;
  const syncListeners = new Set<(result: Result<SyncSummary>) => void>();
  Reflect.set(window, AUTO_SYNC_HOOK, () => {
    syncedBooks = [{ ...createFixtureBook(), id: 2, hash: 'synced-hash', title: 'Synced Book' }];
    const summary: SyncSummary = { added: 1, updated: 0, deleted: 0, uploaded: 0, downloaded: 0, warnings: [], skippedDownloads: [] };
    syncListeners.forEach((listener) => listener(ok(summary)));
  });
  const deviceCodeListeners = new Set<(prompt: DeviceCodePrompt) => void>();
  const signIn = (): Promise<Result<CloudAccount>> =>
    new Promise((resolve) => {
      deviceCodeListeners.forEach((listener) => listener(SIGN_IN_PROMPT));
      Reflect.set(window, APPROVE_SIGN_IN_HOOK, () => {
        account = SIGNED_IN_ACCOUNT;
        resolve(ok(SIGNED_IN_ACCOUNT));
      });
    });

  return {
    ...createInMemoryReaderApi(),
    getCloudAccount: () => done(account),
    connectCloud: signIn,
    onDeviceCode: (listener) => {
      deviceCodeListeners.add(listener);
      return () => deviceCodeListeners.delete(listener);
    },
    disconnectCloud: () => {
      account = null;
      return done(undefined);
    },
    // Always reports one PDF skipped on mobile data, to show how the Library words it.
    runSync: () =>
      done({
        added: 0,
        updated: 0,
        deleted: 0,
        uploaded: 0,
        downloaded: 0,
        warnings: [],
        skippedDownloads: [{ hash: 'skipped-hash', title: 'Skipped Book', reason: 'network', message: 'PDFs download on Wi-Fi. Connect to Wi-Fi, or allow mobile data in Settings.' }],
      }),
    capabilities: { ...createInMemoryReaderApi().capabilities, mobileDataDownloads: true },
    getDownloadOverMobileData: () => done(downloadOverMobileData),
    setDownloadOverMobileData: (allowed: boolean) => {
      downloadOverMobileData = allowed;
      return done(undefined);
    },
    getDocumentUrl: () => FIXTURE_URL,
    listFiles: () => done([book, ...syncedBooks]),
    onSyncComplete: (listener) => {
      syncListeners.add(listener);
      return () => syncListeners.delete(listener);
    },
    setFileStatus: (_id: number, status: BookStatus) => update({ status }),
    setFileTags: (_id: number, tags: string[]) => update({ tags }),
    setFileTitle: (_id: number, title: string) => update({ title }),
    setFileFavorite: (_id: number, favorite: boolean) => update({ favorite }),
    setFilePageCount: (_id: number, pageCount: number) => update({ pageCount }),
    getFileZoom: (_id: number, mode: ReadMode) => done(zooms[mode]),
    setFileZoom: (_id: number, zoom: number, mode: ReadMode) => {
      zooms[mode] = zoom;
      return done(undefined);
    },
    getLastPosition: () => done(lastPosition),
    saveLastPosition: (_id: number, page: number, position: number, mode: ReadMode) => {
      lastPosition = { page, position, mode };
      return update({ lastPage: page, lastPosition: position, lastMode: mode, lastReadAt: Date.now() });
    },
    deleteFile: () => update({}),
  };
}
