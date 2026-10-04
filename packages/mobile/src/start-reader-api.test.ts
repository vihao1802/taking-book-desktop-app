import { describe, expect, it, vi } from 'vitest';
import { startDatabase } from '@taking-book/core';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';
import { createFakeConnection } from './fake-sqlite-connection';

const database = vi.hoisted(() => ({ openDatabase: vi.fn() }));
vi.mock('./open-database', () => database);
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { getUri: async () => ({ uri: 'file:///data/files/books' }) },
  Directory: { Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { convertFileSrc: (uri: string) => uri } }));
vi.mock('@capacitor/app', () => ({ App: { getInfo: async () => ({ version: '1.2.0' }) } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: async () => undefined } }));
vi.mock('@capawesome/capacitor-file-picker', () => ({ FilePicker: {} }));
vi.mock('@capacitor/clipboard', () => ({ Clipboard: {} }));
vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {} }));

import { startReaderApi } from './start-reader-api';

describe('startReaderApi', () => {
  it('passes the open-database error through', async () => {
    database.openDatabase.mockResolvedValue({ ok: false, error: 'The database could not be opened: boom' });
    expect(await startReaderApi()).toEqual({ ok: false, error: 'The database could not be opened: boom' });
  });

  it('builds a reader API over the database whose settings survive a second start', async () => {
    const db = createCapacitorSqlDriver(createFakeConnection());
    await startDatabase(db);
    database.openDatabase.mockResolvedValue({ ok: true, data: db });

    const first = await startReaderApi();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await first.data.setTheme('dark');

    const second = await startReaderApi();
    expect(second.ok && (await second.data.getTheme())).toEqual({ ok: true, data: 'dark' });
  });
});
