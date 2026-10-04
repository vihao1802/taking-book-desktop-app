import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { startDatabase, type SqlDriver } from '@taking-book/core';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';

const DATABASE_NAME = 'taking-book';

/**
 * Opens the app database through the Capacitor SQLite plugin and brings its
 * schema up to date.
 *
 * @returns The started database. Rejects when it cannot be opened or its tables
 *   cannot be created, since nothing works without them.
 */
export async function openDatabase(): Promise<SqlDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  // After a WebView reload the native connection can outlive the page.
  const existing = (await sqlite.isConnection(DATABASE_NAME, false)).result === true;
  const connection = existing
    ? await sqlite.retrieveConnection(DATABASE_NAME, false)
    : await sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', 1, false);
  await connection.open();
  await connection.execute('PRAGMA foreign_keys = ON', false);

  const driver = createCapacitorSqlDriver(connection);
  const started = await startDatabase(driver);
  if (!started.ok) throw new Error(started.error);
  for (const failure of started.data) {
    console.error(`Database migration failed; some features may not work until it succeeds: ${failure}`);
  }
  return driver;
}
