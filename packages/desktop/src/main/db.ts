import { app } from 'electron';
import Database from 'better-sqlite3';
import { filesSchema, migrateFilesSchema, settingsSchema } from '@taking-book/core';
import fs from 'node:fs';
import path from 'node:path';
import type { SqlDriver } from '@taking-book/core';
import { createSqlDriver } from './sqliteDriver';

let driver: SqlDriver | null = null;

/**
 * Opens (or reuses) the app database and applies any schema migration for the
 * sync columns. Must resolve before IPC handlers register so the library table
 * is ready for sync stamps.
 */
export async function getDriver(): Promise<SqlDriver> {
  if (driver) return driver;
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'taking-book.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`${filesSchema()} ${settingsSchema()}`);
  driver = createSqlDriver(db);
  await migrateFilesSchema(driver);
  return driver;
}
