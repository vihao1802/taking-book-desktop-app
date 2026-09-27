import Database from 'better-sqlite3';
import { isErr, isOk, settingsSchema, type SqlDriver } from '@taking-book/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqlDriver } from './sqliteDriver';

// Stand-in for the OS keychain: a reversible transform so round-tripping is
// verifiable, distinct enough from identity that a bug leaving the value in
// plaintext would be caught.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`, 'utf8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf8').replace(/^enc:/, ''),
  },
}));

import { createApiKeyStore } from './apiKeyStore';

function freshDb(): SqlDriver {
  const db = createSqlDriver(new Database(':memory:'));
  void db.exec(settingsSchema());
  return db;
}

describe('apiKeyStore', () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = freshDb();
    await db.exec(settingsSchema());
  });

  it('has no key until one is saved', async () => {
    const store = createApiKeyStore(db);
    expect(await store.hasKey()).toEqual({ ok: true, data: false });
    expect(await store.getKey()).toEqual({ ok: true, data: null });
  });

  it('saves, reports and returns the key', async () => {
    const store = createApiKeyStore(db);
    expect(isOk(await store.setKey('sk-abc123'))).toBe(true);
    expect(await store.hasKey()).toEqual({ ok: true, data: true });
    expect(await store.getKey()).toEqual({ ok: true, data: 'sk-abc123' });
  });

  it('trims surrounding whitespace before saving', async () => {
    const store = createApiKeyStore(db);
    await store.setKey('  sk-abc123  ');
    expect(await store.getKey()).toEqual({ ok: true, data: 'sk-abc123' });
  });

  it('rejects an empty or whitespace-only key and saves nothing', async () => {
    const store = createApiKeyStore(db);
    expect(isErr(await store.setKey(''))).toBe(true);
    expect(isErr(await store.setKey('   ')));
    expect(await store.hasKey()).toEqual({ ok: true, data: false });
  });

  it('replaces an earlier key', async () => {
    const store = createApiKeyStore(db);
    await store.setKey('sk-first');
    await store.setKey('sk-second');
    expect(await store.getKey()).toEqual({ ok: true, data: 'sk-second' });
  });

  it('removes the key', async () => {
    const store = createApiKeyStore(db);
    await store.setKey('sk-abc123');
    expect(isOk(await store.clearKey())).toBe(true);
    expect(await store.hasKey()).toEqual({ ok: true, data: false });
    expect(await store.getKey()).toEqual({ ok: true, data: null });
  });

  it('never stores the key in plaintext when encryption is available', async () => {
    const store = createApiKeyStore(db);
    await store.setKey('sk-super-secret');
    const raw = await db.get('SELECT value FROM settings WHERE key = ?', ['ai.apiKey']);
    expect(String(raw?.value)).not.toContain('sk-super-secret');
  });
});
