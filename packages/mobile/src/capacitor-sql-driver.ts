import type { SqlDriver, SqlValue } from '@taking-book/core';

/**
 * The part of a `@capacitor-community/sqlite` connection the driver uses. The
 * plugin's own `SQLiteDBConnection` satisfies it; tests supply a fake.
 */
export interface SqliteConnection {
  /** Runs one or more statements; `transaction` true makes the plugin wrap them in its own transaction. */
  execute(statements: string, transaction: boolean): Promise<{ changes?: { changes?: number } }>;
  run(
    statement: string,
    values: SqlValue[],
    transaction: boolean,
  ): Promise<{ changes?: { changes?: number; lastId?: number } }>;
  query(statement: string, values: SqlValue[]): Promise<{ values?: Record<string, unknown>[] }>;
}

function toRow(row: Record<string, unknown>): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = null;
    } else if (typeof value === 'string' || typeof value === 'number') {
      out[key] = value;
    } else if (typeof value === 'bigint') {
      out[key] = Number(value);
    } else if (typeof value === 'boolean') {
      out[key] = value ? 1 : 0;
    } else {
      // Silently dropping the column would hand callers a row that looks complete but is not.
      throw new Error(`Column "${key}" holds a value of an unsupported type (${typeof value}).`);
    }
  }
  return out;
}

type TransactionRunner = <T>(fn: () => Promise<T>) => Promise<T>;

/** Opens, commits and rolls back explicitly, one transaction at a time. */
function createTransactionRunner(connection: SqliteConnection): TransactionRunner {
  let queue: Promise<unknown> = Promise.resolve();

  async function runOne<T>(fn: () => Promise<T>): Promise<T> {
    await connection.execute('BEGIN IMMEDIATE', false);
    let result: T;
    try {
      result = await fn();
    } catch (error) {
      await connection.execute('ROLLBACK', false);
      throw error;
    }
    await connection.execute('COMMIT', false);
    return result;
  }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(() => runOne(fn));
    // The caller gets the rejection; the queue only needs to know this turn is over, so a
    // failed transaction does not stop every later one from starting.
    queue = result.catch(() => undefined);
    return result;
  };
}

/**
 * Wraps a Capacitor SQLite connection in the platform-agnostic SqlDriver used
 * by core. The plugin does not serialize concurrent queries, and it wraps every
 * statement in its own transaction unless told not to, so this driver always
 * passes `transaction: false` and runs its own transactions behind a queue, so
 * a caller never joins another's open transaction.
 *
 * @param connection An open connection with foreign keys already on.
 * @returns A driver that satisfies the `SqlDriver` transaction guarantees.
 */
export function createCapacitorSqlDriver(connection: SqliteConnection): SqlDriver {
  return {
    async exec(sql) {
      await connection.execute(sql, false);
    },
    async run(sql, params = []) {
      const result = await connection.run(sql, params, false);
      return { lastInsertRowid: result.changes?.lastId ?? 0, changes: result.changes?.changes ?? 0 };
    },
    async get(sql, params = []) {
      const result = await connection.query(sql, params);
      const row = result.values?.[0];
      return row === undefined ? undefined : toRow(row);
    },
    async all(sql, params = []) {
      const result = await connection.query(sql, params);
      return (result.values ?? []).map(toRow);
    },
    transaction: createTransactionRunner(connection),
  };
}
