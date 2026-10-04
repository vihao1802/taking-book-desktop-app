import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeConnection } from './fake-sqlite-connection';

const plugin = vi.hoisted(() => ({
  isConnection: vi.fn(),
  createConnection: vi.fn(),
  retrieveConnection: vi.fn(),
}));
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class {
    isConnection = plugin.isConnection;
    createConnection = plugin.createConnection;
    retrieveConnection = plugin.retrieveConnection;
  },
}));

import { openDatabase } from './open-database';

function fakePluginConnection(): ReturnType<typeof createFakeConnection> & { open: () => Promise<void> } {
  return { ...createFakeConnection(), open: async () => undefined };
}

describe('openDatabase', () => {
  beforeEach(() => {
    plugin.isConnection.mockReset().mockResolvedValue({ result: false });
    plugin.createConnection.mockReset();
    plugin.retrieveConnection.mockReset();
  });

  it('opens a new connection and creates the schema', async () => {
    plugin.createConnection.mockResolvedValue(fakePluginConnection());
    const opened = await openDatabase();
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const tables = await opened.data.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'files'");
    expect(tables).toEqual([{ name: 'files' }]);
  });

  it('reuses a connection that survived a WebView reload', async () => {
    plugin.isConnection.mockResolvedValue({ result: true });
    plugin.retrieveConnection.mockResolvedValue(fakePluginConnection());
    expect((await openDatabase()).ok).toBe(true);
    expect(plugin.createConnection).not.toHaveBeenCalled();
  });

  it('returns an error worded for the reader when the plugin cannot open the database', async () => {
    plugin.createConnection.mockRejectedValue(new Error('unable to open database file'));
    expect(await openDatabase()).toEqual({ ok: false, error: 'The database could not be opened: unable to open database file' });
  });
});
