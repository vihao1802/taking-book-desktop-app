import { describe, expect, it } from 'vitest';
import { filesSchema, settingsSchema } from '../src';
import { MAX_DOWNLOAD_BYTES } from '../src/sync/blobTransfer';
import { describeRemoteOnlyBook, downloadBookNow, getSkippedDownloads, saveSkippedDownloads } from '../src/sync/remoteOnly';
import { createMemoryDriver, createMemoryStorage } from './helpers';

async function openDb() {
  const db = createMemoryDriver();
  await db.exec(`${filesSchema()} ${settingsSchema()}`);
  return db;
}

describe('skipped downloads', () => {
  it('starts empty and remembers what the latest sync skipped', async () => {
    const db = await openDb();
    expect(await getSkippedDownloads(db)).toEqual({ ok: true, data: [] });

    const skipped = [{ hash: 'abc', title: 'Dune', reason: 'network' as const, message: 'Use Wi-Fi.' }];
    await saveSkippedDownloads(db, skipped);

    expect(await getSkippedDownloads(db)).toEqual({ ok: true, data: skipped });
  });

  it('replaces the list on every save', async () => {
    const db = await openDb();
    await saveSkippedDownloads(db, [{ hash: 'abc', title: 'Dune', reason: 'size', message: 'big' }]);
    await saveSkippedDownloads(db, []);

    expect(await getSkippedDownloads(db)).toEqual({ ok: true, data: [] });
  });

  it('ignores a saved value it cannot read instead of failing', async () => {
    const db = await openDb();
    await db.run("INSERT INTO settings (key, value) VALUES ('sync.skippedDownloads', 'not json')");

    expect(await getSkippedDownloads(db)).toEqual({ ok: true, data: [] });
  });
});

describe('describeRemoteOnlyBook', () => {
  it('offers Download now for a network or storage reason and the pending state', () => {
    expect(describeRemoteOnlyBook('a', { hash: 'a', title: 'A', reason: 'network', message: 'wifi' })).toEqual({ hash: 'a', reason: 'network', message: 'wifi', canDownloadNow: true });
    expect(describeRemoteOnlyBook('a', { hash: 'a', title: 'A', reason: 'storage', message: 'full' }).canDownloadNow).toBe(true);
    expect(describeRemoteOnlyBook('a', undefined)).toMatchObject({ reason: 'pending', canDownloadNow: true });
  });

  it('does not offer Download now for a PDF that is too large', () => {
    expect(describeRemoteOnlyBook('a', { hash: 'a', title: 'A', reason: 'size', message: 'Read it on desktop.' }).canDownloadNow).toBe(false);
  });
});

describe('downloadBookNow', () => {
  it('copies the PDF from the cloud to the device', async () => {
    const remote = createMemoryStorage();
    await remote.writeFile('blobs/abc', new Uint8Array([1, 2, 3]));
    const local = createMemoryStorage();

    expect(await downloadBookNow({ remote, local, hash: 'abc' })).toEqual({ ok: true, data: undefined });
    expect(local.dump().get('blobs/abc')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('says so when the PDF is not in the cloud', async () => {
    const result = await downloadBookNow({ remote: createMemoryStorage(), local: createMemoryStorage(), hash: 'abc' });

    expect(result.ok).toBe(false);
  });

  it('refuses a PDF over the size limit and points to desktop without reading it', async () => {
    const remote = createMemoryStorage();
    let reads = 0;
    const big = { ...remote, statFile: async () => ({ ok: true as const, data: { size: MAX_DOWNLOAD_BYTES + 1 } }), readFile: async () => (reads++, { ok: true as const, data: null }) };

    const result = await downloadBookNow({ remote: big, local: createMemoryStorage(), hash: 'abc' });

    expect(result).toEqual({ ok: false, error: 'This PDF is too large for this device. Read it on desktop.' });
    expect(reads).toBe(0);
  });

  it('passes a failed read or write through as an error', async () => {
    const remote = createMemoryStorage();
    await remote.writeFile('blobs/abc', new Uint8Array([1]));
    const failingLocal = { ...createMemoryStorage(), writeFile: async () => ({ ok: false as const, error: 'disk full' }) };

    expect(await downloadBookNow({ remote, local: failingLocal, hash: 'abc' })).toEqual({ ok: false, error: 'disk full' });
  });
});
