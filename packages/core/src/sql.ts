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
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
