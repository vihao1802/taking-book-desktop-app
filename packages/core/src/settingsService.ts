import type { Theme } from './models';
import { recordReadingSession } from './readingSessionsRepository';
import type { Result } from './result';
import {
  getDownloadOverMobileData,
  getEffectiveTargetLanguage,
  getNotesSidebarWidth,
  getSidebarWidth,
  getTheme,
  setDownloadOverMobileData,
  setNotesSidebarWidth,
  setSidebarWidth,
  setTargetLanguage,
  setTheme,
} from './settingsRepository';
import type { SqlDriver } from './sql';

export interface SettingsServiceOptions {
  /** Supplies the OS locale, which only the platform knows; it seeds the default Target language. */
  getSystemLocale: () => string;
  /** Current time; injectable for tests. Decides which local calendar day a Reading session counts for. */
  now?: () => Date;
}

/** The database-backed settings and Reading session operations of the reader API. */
export interface SettingsService {
  getTheme(): Promise<Result<Theme>>;
  setTheme(theme: Theme): Promise<Result<void>>;
  getSidebarWidth(): Promise<Result<number | null>>;
  setSidebarWidth(width: number): Promise<Result<void>>;
  getNotesSidebarWidth(): Promise<Result<number | null>>;
  setNotesSidebarWidth(width: number): Promise<Result<void>>;
  /** Resolves to the Target language in effect, defaulted from the system language when never chosen. */
  getTargetLanguage(): Promise<Result<string>>;
  /** Rejects an unsupported code without saving anything. */
  setTargetLanguage(code: string): Promise<Result<void>>;
  /** Whether PDFs may be downloaded over mobile data on this device; off until the reader turns it on. */
  getDownloadOverMobileData(): Promise<Result<boolean>>;
  setDownloadOverMobileData(allowed: boolean): Promise<Result<void>>;
  /** Adds minutes read to a book's total for today (local calendar day). */
  recordReadingSession(fileId: number, minutes: number): Promise<Result<void>>;
}

/** Formats a date as its local calendar day, YYYY-MM-DD. */
export function formatLocalDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Creates the settings service over a database.
 *
 * @param db The started database.
 * @param options System locale source and a test clock.
 * @returns The operations desktop IPC handlers and mobile glue call into.
 */
export function createSettingsService(db: SqlDriver, options: SettingsServiceOptions): SettingsService {
  const now = options.now ?? ((): Date => new Date());
  return {
    getTheme: () => getTheme(db),
    setTheme: (theme) => setTheme(db, theme),
    getSidebarWidth: () => getSidebarWidth(db),
    setSidebarWidth: (width) => setSidebarWidth(db, width),
    getNotesSidebarWidth: () => getNotesSidebarWidth(db),
    setNotesSidebarWidth: (width) => setNotesSidebarWidth(db, width),
    getTargetLanguage: () => getEffectiveTargetLanguage(db, options.getSystemLocale()),
    setTargetLanguage: (code) => setTargetLanguage(db, code),
    getDownloadOverMobileData: () => getDownloadOverMobileData(db),
    setDownloadOverMobileData: (allowed) => setDownloadOverMobileData(db, allowed),
    recordReadingSession: (fileId, minutes) => recordReadingSession(db, fileId, formatLocalDay(now()), minutes),
  };
}
