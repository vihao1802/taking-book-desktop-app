import Database from 'better-sqlite3';
import type { SqliteConnection } from './capacitor-sql-driver';

/**
 * Stands in for the Capacitor SQLite plugin with better-sqlite3. Like the
 * plugin, a statement run with `transaction` true opens its own transaction,
 * which fails inside an open one, so the driver must always pass false.
 */
export function createFakeConnection(): SqliteConnection {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  function inOwnTransaction<T>(transaction: boolean, work: () => T): T {
    if (!transaction) return work();
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    async execute(statements, transaction) {
      inOwnTransaction(transaction, () => db.exec(statements));
      return { changes: { changes: 0 } };
    },
    async run(statement, values, transaction) {
      const info = inOwnTransaction(transaction, () => db.prepare(statement).run(...values));
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    },
    async query(statement, values) {
      return { values: db.prepare(statement).all(...values) as Record<string, unknown>[] };
    },
  };
}
