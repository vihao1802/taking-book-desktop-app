import type Database from 'better-sqlite3';
import type { SqlDriver, SqlRunResult, SqlValue } from '@taking-book/core';

/** Wraps a better-sqlite3 connection in the platform-agnostic SqlDriver used by core repositories. */
export function createSqlDriver(db: Database.Database): SqlDriver {
  function normalizeRow(row: unknown): Record<string, SqlValue> {
    const out: Record<string, SqlValue> = {};
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (value === null || typeof value === 'string' || typeof value === 'number') {
        out[key] = value;
      } else if (typeof value === 'bigint') {
        out[key] = Number(value);
      } else if (typeof value === 'boolean') {
        out[key] = value ? 1 : 0;
      }
    }
    return out;
  }

  function toRunResult(info: Database.RunResult): SqlRunResult {
    return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
  }

  // better-sqlite3's db.transaction() is synchronous: it commits as soon as the callback returns
  // its promise, so work after an await would run outside the transaction. Open and close it
  // explicitly instead, and queue callers so one never joins another's open transaction.
  let transactionQueue: Promise<unknown> = Promise.resolve();

  async function runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      return toRunResult(db.prepare(sql).run(...(params as unknown[])));
    },
    async get(sql, params = []) {
      const row = db.prepare(sql).get(...(params as unknown[]));
      return row === undefined ? undefined : normalizeRow(row);
    },
    async all(sql, params = []) {
      const rows = db.prepare(sql).all(...(params as unknown[]));
      return rows.map(normalizeRow);
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const result = transactionQueue.then(() => runInTransaction(fn));
      transactionQueue = result.catch(() => undefined);
      return result;
    },
  };
}
