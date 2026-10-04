import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  err,
  ok,
  startDatabase,
  upsertFile,
  type BlobTransferPolicy,
  type CloudAccount,
  type CloudProvider,
  type DeviceCodePrompt,
  type Result,
  type SqlDriver,
  type SyncStorage,
} from '@taking-book/core';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';
import { createCloudSync, type CloudSync, type CloudSyncOptions } from './cloud-sync';
import { createFakeConnection } from './fake-sqlite-connection';
import { createMobileServices, type MobileServices } from './mobile-reader-api';

const ACCOUNT: CloudAccount = { providerId: 'google-drive', displayName: 'Reader', email: 'reader@example.com' };
const PROMPT: DeviceCodePrompt = { userCode: 'ABCD-EFGH', verificationUrl: 'https://www.google.com/device', expiresAt: 0 };

function createMemoryStorage(): SyncStorage & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    readFile: async (key) => ok(files.get(key) ?? null),
    statFile: async (key) => ok(files.has(key) ? { size: files.get(key)?.length ?? 0 } : null),
    writeFile: async (key, data) => ok(void files.set(key, data)),
    deleteFile: async (key) => ok(void files.delete(key)),
    listFiles: async (prefix) => ok([...files.keys()].filter((key) => key.startsWith(prefix))),
  };
}

interface FakeProvider extends CloudProvider {
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function createProvider(drive: Result<SyncStorage>): FakeProvider {
  return {
    providerId: 'google-drive',
    providerName: 'Google Drive',
    getAccount: async () => ok(ACCOUNT),
    connect: vi.fn(async (options) => {
      options?.onDeviceCode?.(PROMPT);
      return ok(ACCOUNT);
    }),
    disconnect: vi.fn(async () => ok(undefined)),
    createSyncStorage: async () => drive,
  };
}

async function openDatabase(): Promise<SqlDriver> {
  const db = createCapacitorSqlDriver(createFakeConnection());
  await startDatabase(db);
  return db;
}

function createServices(db: SqlDriver): MobileServices {
  const store = { read: async () => ok(null), write: async () => ok(undefined) };
  return createMobileServices(db, {
    deviceId: 'phone',
    generateUid: () => 'uid-1',
    systemLocale: 'en-GB',
    coverStore: store,
    reflowStore: store,
  });
}

const ALLOW_ALL: BlobTransferPolicy = { uploadBooks: false, decideDownload: async () => ({ download: true }) };

const DESKTOP_MANIFEST = {
  version: 1,
  records: [
    {
      hash: 'abc',
      title: 'Desktop Book',
      status: 'reading',
      tags: [],
      favorite: false,
      lastPage: 12,
      lastPosition: 0.5,
      lastMode: 'page',
      pageCount: 100,
      zoom: null,
      reflowZoom: null,
      lastReadAt: null,
      annotations: [],
      updatedAt: 100,
      updatedBy: 'desktop',
      deleted: false,
    },
  ],
};

describe('createCloudSync', () => {
  let db: SqlDriver;
  let drive: ReturnType<typeof createMemoryStorage>;
  let log: ReturnType<typeof vi.fn>;

  function createSync(
    provider: CloudProvider | null,
    overrides: Partial<Pick<CloudSyncOptions, 'localStorage' | 'blobTransfer'>> = {},
  ): CloudSync {
    return createCloudSync({
      db,
      provider,
      localStorage: overrides.localStorage ?? createMemoryStorage(),
      resolveLocalPath: (hash) => `books/${hash}.pdf`,
      blobTransfer: overrides.blobTransfer ?? ALLOW_ALL,
      presentDeviceCode: vi.fn(async () => undefined),
      log,
    });
  }

  beforeEach(async () => {
    db = await openDatabase();
    drive = createMemoryStorage();
    log = vi.fn();
  });

  it('brings a Book added on desktop into the Library', async () => {
    await drive.writeFile('manifest.json', new TextEncoder().encode(JSON.stringify(DESKTOP_MANIFEST)));

    const summary = await createSync(createProvider(ok(drive))).runSync();

    expect(summary.ok && summary.data.added).toBe(1);
    const books = await createServices(db).library.listBooks();
    expect(books.ok && books.data.map((book) => [book.title, book.path, book.lastPage])).toEqual([['Desktop Book', 'books/abc.pdf', 12]]);
  });

  it('sends a Highlight made on the phone to the Drive manifest', async () => {
    await upsertFile(db, { hash: 'abc', title: 'Dune', filePath: 'books/abc.pdf' }, { updatedAt: 1, updatedBy: 'phone' });
    await createServices(db).annotations.create('abc', {
      page: 3, pageStart: 0, pageEnd: 5, quote: 'a line', color: 'yellow', note: null, paraIndex: null, paraStart: null, paraEnd: null,
    });

    const summary = await createSync(createProvider(ok(drive))).runSync();

    expect(summary.ok).toBe(true);
    const manifest = JSON.parse(new TextDecoder().decode(drive.files.get('manifest.json')));
    expect(manifest.records[0].annotations.map((annotation: { quote: string }) => annotation.quote)).toEqual(['a line']);
  });

  it('downloads a PDF the policy allows and leaves the phone side as one file per hash', async () => {
    await drive.writeFile('manifest.json', new TextEncoder().encode(JSON.stringify(DESKTOP_MANIFEST)));
    await drive.writeFile('blobs/abc', new Uint8Array([1, 2]));
    const local = createMemoryStorage();

    const summary = await createSync(createProvider(ok(drive)), { localStorage: local }).runSync();

    expect(summary.ok && summary.data.downloaded).toBe(1);
    expect(local.files.get('blobs/abc')).toEqual(new Uint8Array([1, 2]));
  });

  it('still syncs the manifest when the policy refuses the PDF, and reports why', async () => {
    await drive.writeFile('manifest.json', new TextEncoder().encode(JSON.stringify(DESKTOP_MANIFEST)));
    await drive.writeFile('blobs/abc', new Uint8Array([1, 2]));
    const local = createMemoryStorage();
    const refuse: BlobTransferPolicy = {
      uploadBooks: false,
      decideDownload: async () => ({ download: false, reason: 'network', message: 'Use Wi-Fi.' }),
    };

    const summary = await createSync(createProvider(ok(drive)), { localStorage: local, blobTransfer: refuse }).runSync();

    expect(summary.ok && [summary.data.added, summary.data.downloaded, summary.data.skippedDownloads.map((s) => s.reason)]).toEqual([1, 0, ['network']]);
    expect(local.files.size).toBe(0);
  });

  it('never uploads the phone PDFs to Drive', async () => {
    await upsertFile(db, { hash: 'abc', title: 'Dune', filePath: 'books/abc.pdf' }, { updatedAt: 1, updatedBy: 'phone' });
    const local = createMemoryStorage();
    await local.writeFile('blobs/abc', new Uint8Array([9]));

    await createSync(createProvider(ok(drive)), { localStorage: local }).runSync();

    expect(drive.files.has('blobs/abc')).toBe(false);
  });

  it('leaves the library untouched and reports the error when the sync fails', async () => {
    await upsertFile(db, { hash: 'abc', title: 'Dune', filePath: 'books/abc.pdf' }, { updatedAt: 1, updatedBy: 'phone' });
    const offline = createProvider(err('Drive request failed: Unable to resolve host'));

    const summary = await createSync(offline).runSync();

    expect(summary).toEqual(err('Drive request failed: Unable to resolve host'));
    const books = await createServices(db).library.listBooks();
    expect(books.ok && books.data.map((book) => book.title)).toEqual(['Dune']);
  });

  it('does not throw when the storage fails in the middle of a sync', async () => {
    const broken: SyncStorage = { ...createMemoryStorage(), readFile: async () => Promise.reject(new Error('socket closed')) };

    const summary = await createSync(createProvider(ok(broken))).runSync();

    expect(summary.ok).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('socket closed'));
  });

  it('joins a sync already running instead of starting a second one', async () => {
    let reads = 0;
    const slow: SyncStorage = {
      ...drive,
      readFile: async () => {
        reads += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return ok(null);
      },
    };
    const sync = createSync(createProvider(ok(slow)));

    await Promise.all([sync.runSync(), sync.runSync()]);

    expect(reads).toBe(1);
  });

  it('tells the listeners and the presenter about the sign-in code while connecting', async () => {
    const presentDeviceCode = vi.fn(async () => undefined);
    const sync = createCloudSync({
      db,
      provider: createProvider(ok(drive)),
      localStorage: createMemoryStorage(),
      resolveLocalPath: (hash) => hash,
      blobTransfer: ALLOW_ALL,
      presentDeviceCode,
      log,
    });
    const shown: DeviceCodePrompt[] = [];
    const unsubscribe = sync.onDeviceCode((prompt) => shown.push(prompt));

    expect(await sync.connectCloud()).toEqual(ok(ACCOUNT));
    unsubscribe();
    await sync.connectCloud();

    expect(shown).toEqual([PROMPT]);
    expect(presentDeviceCode).toHaveBeenCalledTimes(2);
  });

  it('forgets the sign-in when disconnected', async () => {
    const provider = createProvider(ok(drive));

    expect(await createSync(provider).disconnectCloud()).toEqual(ok(undefined));

    expect(provider.disconnect).toHaveBeenCalled();
  });

  it('says sync is not set up when the build has no OAuth client', async () => {
    const sync = createSync(null);

    expect(await sync.getCloudAccount()).toEqual(ok(null));
    expect((await sync.connectCloud()).ok).toBe(false);
    expect((await sync.runSync()).ok).toBe(false);
  });
});
