/**
 * Minimal SQLite surface that both desktop (better-sqlite3) and mobile
 * (react-native-sqlite-storage / expo-sqlite) can implement. Repositories in
 * this package only ever talk to this interface, never to a specific driver.
 */

export type SqlValue = string | number | null;

export interface SqlRunResult {
  lastInsertRowid: number;
  changes: number;
}

export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<SqlRunResult>;
  get(sql: string, params?: SqlValue[]): Promise<Record<string, SqlValue> | undefined>;
  all(sql: string, params?: SqlValue[]): Promise<Record<string, SqlValue>[]>;
  /**
   * Runs `fn` atomically. Every driver must guarantee:
   * - All statements issued through this driver until `fn` settles, including those after an
   *   `await`, belong to one transaction: committed together when `fn` resolves, rolled back
   *   together (and the error rethrown) when it rejects.
   * - Transactions are serialized: a second concurrent `transaction` call waits for the open one
   *   to finish instead of joining it, so a rollback never discards another caller's work.
   * - Calling `transaction` from inside `fn` would wait on itself forever; callers must not nest.
   * Drivers whose engine has no async transaction primitive (e.g. mobile) satisfy this with a
   * write mutex around explicit BEGIN/COMMIT/ROLLBACK.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
