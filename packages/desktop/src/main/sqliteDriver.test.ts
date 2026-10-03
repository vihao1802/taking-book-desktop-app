import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SqlDriver } from '@taking-book/core';
import { createSqlDriver } from './sqliteDriver';

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function countRows(driver: SqlDriver): Promise<number> {
  const row = await driver.get('SELECT COUNT(*) AS total FROM items');
  return Number(row?.total);
}

describe('createSqlDriver transaction', () => {
  let driver: SqlDriver;

  beforeEach(async () => {
    driver = createSqlDriver(new Database(':memory:'));
    await driver.exec('CREATE TABLE items (name TEXT NOT NULL)');
  });

  it('commits work done after an await together', async () => {
    const result = await driver.transaction(async () => {
      await driver.run('INSERT INTO items (name) VALUES (?)', ['a']);
      await tick();
      await driver.run('INSERT INTO items (name) VALUES (?)', ['b']);
      return 'done';
    });

    expect(result).toBe('done');
    expect(await countRows(driver)).toBe(2);
  });

  it('rolls back work done before and after an await when the function throws', async () => {
    await expect(
      driver.transaction(async () => {
        await driver.run('INSERT INTO items (name) VALUES (?)', ['a']);
        await tick();
        await driver.run('INSERT INTO items (name) VALUES (?)', ['b']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await countRows(driver)).toBe(0);
  });

  it('keeps a second concurrent caller out of an open transaction', async () => {
    let releaseFirst: () => void = () => undefined;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const order: string[] = [];

    const first = driver.transaction(async () => {
      order.push('first-start');
      await driver.run('INSERT INTO items (name) VALUES (?)', ['first']);
      await firstMayFinish;
      order.push('first-end');
      throw new Error('first fails');
    });
    const second = driver.transaction(async () => {
      order.push('second-start');
      await driver.run('INSERT INTO items (name) VALUES (?)', ['second']);
    });

    await tick();
    expect(order).toEqual(['first-start']);
    releaseFirst();

    await expect(first).rejects.toThrow('first fails');
    await second;
    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
    // The first caller's rollback must not take the second caller's row with it.
    const names = await driver.all('SELECT name FROM items');
    expect(names).toEqual([{ name: 'second' }]);
  });
});
