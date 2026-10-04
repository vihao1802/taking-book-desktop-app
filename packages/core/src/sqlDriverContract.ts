import type { SqlDriver } from './sql';

/**
 * The slice of a test runner the contract needs, so core stays free of a
 * test-framework import: pass Vitest's `describe` and `it`.
 */
export interface SqlDriverContractHarness {
  describe(name: string, define: () => void): void;
  it(name: string, run: () => Promise<void>): void;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const POLL_MS = 5;
const WAIT_LIMIT_MS = 5000;
// How long to let a transaction that should be waiting show that it is not.
const SETTLE_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A real driver's calls cross a native bridge, so "started" takes more than one event-loop tick. */
async function waitUntil(condition: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(message);
    await delay(POLL_MS);
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function countRows(driver: SqlDriver): Promise<number> {
  const row = await driver.get('SELECT COUNT(*) AS total FROM items');
  return Number(row?.total);
}

async function expectRejection(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    check(error instanceof Error && error.message === message, `Expected rejection "${message}", got ${String(error)}`);
    return;
  }
  throw new Error(`Expected rejection "${message}", but the promise resolved`);
}

/**
 * Registers the tests every `SqlDriver` implementation must pass: the
 * transaction guarantees documented on the interface. Desktop and mobile run
 * the same tests against their own driver.
 *
 * @param harness The test runner's `describe` and `it`.
 * @param createDriver Makes a fresh, empty, in-memory-equivalent database per test.
 */
export function describeSqlDriverContract(harness: SqlDriverContractHarness, createDriver: () => Promise<SqlDriver>): void {
  harness.describe('SqlDriver transaction contract', () => {
    async function freshDriver(): Promise<SqlDriver> {
      const driver = await createDriver();
      await driver.exec('CREATE TABLE items (name TEXT NOT NULL)');
      return driver;
    }

    harness.it('commits work done after an await together', async () => {
      const driver = await freshDriver();
      const result = await driver.transaction(async () => {
        await driver.run('INSERT INTO items (name) VALUES (?)', ['a']);
        await tick();
        await driver.run('INSERT INTO items (name) VALUES (?)', ['b']);
        return 'done';
      });
      check(result === 'done', 'the transaction should resolve with its function result');
      check((await countRows(driver)) === 2, 'both rows should be committed');
    });

    harness.it('rolls back work done before and after an await when the function throws', async () => {
      const driver = await freshDriver();
      await expectRejection(
        driver.transaction(async () => {
          await driver.run('INSERT INTO items (name) VALUES (?)', ['a']);
          await tick();
          await driver.run('INSERT INTO items (name) VALUES (?)', ['b']);
          throw new Error('boom');
        }),
        'boom',
      );
      check((await countRows(driver)) === 0, 'no row should survive the rollback');
    });

    harness.it('keeps a second concurrent caller out of an open transaction', async () => {
      const driver = await freshDriver();
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

      // When a check below fails first, these still settle; mark them handled so that is not reported as a second error.
      first.catch(() => undefined);
      second.catch(() => undefined);

      try {
        await waitUntil(() => order.includes('first-start'), 'the first transaction never started');
        await delay(SETTLE_MS);
        check(order.join() === 'first-start', 'the second transaction must wait for the first');
      } finally {
        // Always let the first finish, so a failed check cannot leave a transaction open for later tests.
        releaseFirst();
      }

      await expectRejection(first, 'first fails');
      await second;
      check(order.join() === 'first-start,first-end,second-start', `unexpected order: ${order.join()}`);
      // The first caller's rollback must not take the second caller's row with it.
      const names = await driver.all('SELECT name FROM items');
      check(JSON.stringify(names) === '[{"name":"second"}]', `unexpected rows: ${JSON.stringify(names)}`);
    });

    harness.it('keeps working after a transaction fails', async () => {
      const driver = await freshDriver();
      await expectRejection(
        driver.transaction(async () => {
          throw new Error('first fails');
        }),
        'first fails',
      );
      await driver.transaction(async () => {
        await driver.run('INSERT INTO items (name) VALUES (?)', ['after']);
      });
      check((await countRows(driver)) === 1, 'a later transaction should still commit');
    });

    harness.it('reports the last inserted row id and the number of changed rows', async () => {
      const driver = await freshDriver();
      const first = await driver.run('INSERT INTO items (name) VALUES (?)', ['a']);
      const second = await driver.run('INSERT INTO items (name) VALUES (?)', ['b']);
      check(second.lastInsertRowid === first.lastInsertRowid + 1, 'row ids should advance');
      check(first.changes === 1, 'an insert changes one row');
      const updated = await driver.run('UPDATE items SET name = ?', ['c']);
      check(updated.changes === 2, 'an update reports every changed row');
    });

    harness.it('returns undefined for a missing row and plain values for found ones', async () => {
      const driver = await freshDriver();
      check((await driver.get('SELECT name FROM items')) === undefined, 'an empty table has no row');
      await driver.run('INSERT INTO items (name) VALUES (?)', ['a']);
      const row = await driver.get('SELECT name, 7 AS seven, NULL AS absent FROM items');
      check(JSON.stringify(row) === '{"name":"a","seven":7,"absent":null}', `unexpected row: ${JSON.stringify(row)}`);
    });
  });
}
