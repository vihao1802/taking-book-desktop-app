import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { err, ok, startDatabase, type Result, type SqlDriver } from '@taking-book/core';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';

const DATABASE_NAME = 'taking-book';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Opens a named database through the Capacitor SQLite plugin with foreign keys on.
 *
 * @param name The database name; the file lands in the app's private storage.
 * @returns A SqlDriver over the open connection.
 */
export async function openConnection(name: string): Promise<SqlDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  // After a WebView reload the native connection can outlive the page.
  const existing = (await sqlite.isConnection(name, false)).result === true;
  const connection: SQLiteDBConnection = existing
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await connection.open();
  await connection.execute('PRAGMA foreign_keys = ON', false);
  return createCapacitorSqlDriver(connection);
}

/**
 * Opens the app database and brings its schema up to date.
 *
 * @returns The started database, or an error when it cannot be opened or its
 *   tables cannot be created, since nothing works without them.
 */
export async function openDatabase(): Promise<Result<SqlDriver>> {
  let driver: SqlDriver;
  try {
    driver = await openConnection(DATABASE_NAME);
  } catch (error) {
    return err(`The database could not be opened: ${errorMessage(error)}`);
  }
  const started = await startDatabase(driver);
  if (!started.ok) return err(started.error);
  for (const failure of started.data) {
    console.error(`Database migration failed; some features may not work until it succeeds: ${failure}`);
  }
  return ok(driver);
}
