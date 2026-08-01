import Database from 'better-sqlite3';
import type { SqlDriver, SqlRunResult, SqlValue } from '../src/sql';

/**
 * Test-only adapter: backs the platform-agnostic SqlDriver interface with
 * better-sqlite3 in memory. Production adapters live in each platform package.
 */
export function createMemoryDriver(): SqlDriver {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  function toRunResult(info: Database.RunResult): SqlRunResult {
    return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
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
      if (row === undefined) return undefined;
      return normalizeRow(row);
    },
    async all(sql, params = []) {
      const rows = db.prepare(sql).all(...(params as unknown[]));
      return rows.map(normalizeRow);
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return db.transaction(fn)();
    },
  };
}

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
