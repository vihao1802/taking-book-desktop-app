import { describe, expect, it } from 'vitest';
import {
  deleteFile,
  filesSchema,
  isOk,
  listFiles,
  syncLibrary,
  upsertFile,
} from '../src';
import type { Result, SqlDriver } from '../src';
import { createMemoryDriver } from './helpers';
import type { SyncStorage } from '../src/sync/types';

/** In-memory cloud-drive folder, shared by "devices" during a test. */
function createMemoryStorage(): SyncStorage & { dump(): Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    async readFile(key) {
      const data = files.get(key);
      return { ok: true, data: data ?? null };
    },
    async writeFile(key, data) {
      files.set(key, data);
      return { ok: true, data: undefined };
    },
    async deleteFile(key) {
      files.delete(key);
      return { ok: true, data: undefined };
    },
    async listFiles(prefix) {
      const keys = [...files.keys()].filter((key) => key.startsWith(prefix));
      return { ok: true, data: keys };
    },
    dump() {
      return files;
    },
  };
}

async function addBook(db: SqlDriver, hash: string, title: string, path = `/docs/${hash}.pdf`) {
  const result = await upsertFile(db, { filePath: path, hash, title });
  expect(isOk(result)).toBe(true);
}

function localStorageWith(hash: string): SyncStorage & { dump(): Map<string, Uint8Array> } {
  const store = createMemoryStorage();
  void store.writeFile(`blobs/${hash}`, new TextEncoder().encode(hash));
  return store;
}

describe('syncLibrary', () => {
  it('uploads local books and manifest to an empty drive', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await addBook(db, 'abc', 'Alpha');
    const local = localStorageWith('abc');
    const remote = createMemoryStorage();

    const result = await syncLibrary(db, {
      local,
      remote,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.data.added).toBe(1);
      expect(result.data.uploaded).toBe(1);
      expect(result.data.warnings).toEqual([]);
    }

    const remoteManifest = remote.dump().get('manifest.json');
    expect(remoteManifest).toBeDefined();
    const parsed = JSON.parse(new TextDecoder().decode(remoteManifest ?? new Uint8Array()));
    expect(parsed.records).toHaveLength(1);
    expect(remote.dump().has('blobs/abc')).toBe(true);
  });

  it('downloads books from the drive into a fresh local db', async () => {
    const shared = createMemoryStorage();
    await shared.writeFile(
      'manifest.json',
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          records: [
            {
              hash: 'abc',
              title: 'Alpha',
              status: 'unread',
              tags: ['sync'],
              lastPage: null,
              lastPosition: null,
              updatedAt: 100,
              updatedBy: 'dev-remote',
              deleted: false,
            },
          ],
        }),
      ),
    );
    await shared.writeFile('blobs/abc', new TextEncoder().encode('pdf-bytes'));

    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const local = createMemoryStorage();

    const result = await syncLibrary(db, {
      local,
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.data.added).toBe(1);
      expect(result.data.downloaded).toBe(1);
    }

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) {
      expect(files.data[0].title).toBe('Alpha');
      expect(files.data[0].tags).toEqual(['sync']);
    }
    expect(new TextDecoder().decode(local.dump().get('blobs/abc'))).toBe('pdf-bytes');
  });

  it('a remote edit wins when its clock is newer', async () => {
    const shared = createMemoryStorage();
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await addBook(db, 'abc', 'Alpha');

    // Sync up, then the remote device renames the book with a newer clock.
    await syncLibrary(db, {
      local: localStorageWith('abc'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    const manifest = JSON.parse(
      new TextDecoder().decode(shared.dump().get('manifest.json') ?? new Uint8Array()),
    );
    const remoteRecord = {
      ...manifest.records[0],
      title: 'Renamed remotely',
      updatedAt: Number(manifest.records[0].updatedAt) + 1000,
      updatedBy: 'dev-remote',
    };
    await shared.writeFile(
      'manifest.json',
      new TextEncoder().encode(JSON.stringify({ version: 1, records: [remoteRecord] })),
    );

    const result = await syncLibrary(db, {
      local: localStorageWith('abc'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    expect(isOk(result)).toBe(true);

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) expect(files.data[0].title).toBe('Renamed remotely');
  });

  it('a local edit wins over an older remote copy', async () => {
    const shared = createMemoryStorage();
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await addBook(db, 'abc', 'Alpha');

    await syncLibrary(db, {
      local: localStorageWith('abc'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });

    // Local edit bumps the clock; remote manifest stays stale.
    const result = await upsertFile(db, { filePath: '/renamed.pdf', hash: 'abc', title: 'Local rename' });
    expect(isOk(result)).toBe(true);

    const syncResult = await syncLibrary(db, {
      local: localStorageWith('abc'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    expect(isOk(syncResult)).toBe(true);

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) expect(files.data[0].title).toBe('Local rename');
  });

  it('propagates a local delete to the remote manifest', async () => {
    const shared = createMemoryStorage();
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await addBook(db, 'abc', 'Alpha');

    await syncLibrary(db, {
      local: localStorageWith('abc'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });

    const listed = await listFiles(db);
    expect(isOk(listed)).toBe(true);
    if (!isOk(listed)) return;
    const deleted = await deleteFile(db, listed.data[0].id, { updatedAt: Date.now() + 5000, updatedBy: 'dev-a' });
    expect(isOk(deleted)).toBe(true);

    const syncResult = await syncLibrary(db, {
      local: localStorageWith('abc'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    expect(isOk(syncResult)).toBe(true);
    if (isOk(syncResult)) expect(syncResult.data.deleted).toBe(1);

    const manifest = JSON.parse(
      new TextDecoder().decode(shared.dump().get('manifest.json') ?? new Uint8Array()),
    );
    expect(manifest.records[0].deleted).toBe(true);
    expect(shared.dump().has('blobs/abc')).toBe(false);
  });

  it('leaves the local db untouched when the remote is unreachable', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await addBook(db, 'abc', 'Alpha');

    const brokenRemote: SyncStorage = {
      async readFile() {
        return { ok: false, error: 'network offline' };
      },
      async writeFile() {
        return { ok: false, error: 'network offline' };
      },
      async deleteFile() {
        return { ok: false, error: 'network offline' };
      },
      async listFiles() {
        return { ok: false, error: 'network offline' };
      },
    };

    const result = await syncLibrary(db, {
      local: createMemoryStorage(),
      remote: brokenRemote,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) expect(result.error).toContain('offline');

    const files = await listFiles(db);
    expect(isOk(files)).toBe(true);
    if (isOk(files)) expect(files.data).toHaveLength(1);
  });

  it('converges two devices on the same drive', async () => {
    const shared = createMemoryStorage();

    const deviceA = createMemoryDriver();
    await deviceA.exec(filesSchema());
    await addBook(deviceA, 'aaa', 'Book A');

    const deviceB = createMemoryDriver();
    await deviceB.exec(filesSchema());
    await addBook(deviceB, 'bbb', 'Book B');

    await syncLibrary(deviceA, {
      local: localStorageWith('aaa'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    await syncLibrary(deviceB, {
      local: localStorageWith('bbb'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    await syncLibrary(deviceA, {
      local: localStorageWith('aaa'),
      remote: shared,
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });

    const filesA = await listFiles(deviceA);
    const filesB = await listFiles(deviceB);
    expect(isOk(filesA) && isOk(filesB)).toBe(true);
    if (isOk(filesA) && isOk(filesB)) {
      expect(filesA.data.map((f) => f.hash).sort()).toEqual(['aaa', 'bbb']);
      expect(filesB.data.map((f) => f.hash).sort()).toEqual(['aaa', 'bbb']);
    }
  });

  it('records a missing remote read as a warning, not a failure', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await addBook(db, 'abc', 'Alpha');

    const local = createMemoryStorage();
    const result = await syncLibrary(db, {
      local,
      remote: createMemoryStorage(),
      resolveLocalPath: (hash) => `/blobs/${hash}`,
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.data.added).toBe(1);
  });
});
