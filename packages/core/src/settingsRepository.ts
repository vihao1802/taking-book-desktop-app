import type { Theme } from './models';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver } from './sql';

/** Returns the schema DDL for key/value app settings. */
export function settingsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;
}

function isTheme(value: string): value is Theme {
  return value === 'light' || value === 'dark' || value === 'sepia' || value === 'system';
}

/** Reads the persisted theme, falling back to 'system'. */
export async function getTheme(db: SqlDriver): Promise<Result<Theme>> {
  try {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', ['theme']);
    const value = row ? String(row.value) : 'system';
    return ok(isTheme(value) ? value : 'system');
  } catch (error) {
    return err(`Failed to read theme: ${errorMessage(error)}`);
  }
}

/** Persists the theme. */
export async function setTheme(db: SqlDriver, theme: Theme): Promise<Result<void>> {
  try {
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['theme', theme],
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to save theme: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
