import { describe, expect, it } from 'vitest';
import { describeSqlDriverContract } from '@taking-book/core';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';
import { createFakeConnection } from './fake-sqlite-connection';

describeSqlDriverContract({ describe, it }, async () => createCapacitorSqlDriver(createFakeConnection()));

describe('createCapacitorSqlDriver', () => {
  it('turns a boolean or bigint column into a number and drops unsupported values', async () => {
    const driver = createCapacitorSqlDriver({
      execute: async () => ({}),
      run: async () => ({}),
      query: async () => ({ values: [{ a: true, b: 5n, c: 'x', d: undefined, e: new Uint8Array(1) }] }),
    });
    expect(await driver.get('SELECT 1')).toEqual({ a: 1, b: 5, c: 'x' });
  });

  it('lets a failing statement reject so the caller can report it', async () => {
    const driver = createCapacitorSqlDriver(createFakeConnection());
    await expect(driver.run('INSERT INTO missing VALUES (1)')).rejects.toThrow();
  });
});
