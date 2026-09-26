import { getCustomSoundHash } from './custom-sounds';
import { getAmbientSound, resolveFocusPreferences, validateFocusMinutes, type FocusPreferences } from './focus';
import type { Theme } from './models';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver } from './sql';
import { isSupportedLanguage, resolveTargetLanguage } from './translation/languages';

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

/** Reads a string setting, or null when it was never written. */
export async function getSetting(db: SqlDriver, key: string): Promise<Result<string | null>> {
  try {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return ok(row ? String(row.value) : null);
  } catch (error) {
    return err(`Failed to read setting "${key}": ${errorMessage(error)}`);
  }
}

/** Writes or replaces a string setting. */
export async function setSetting(
  db: SqlDriver,
  key: string,
  value: string,
): Promise<Result<void>> {
  try {
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to save setting "${key}": ${errorMessage(error)}`);
  }
}

const SIDEBAR_WIDTH_KEY = 'reader.sidebarWidth';

/**
 * Reads the reader sidebar's saved width in pixels.
 *
 * @returns The width, or null when it was never saved or the stored value is not a finite number.
 */
export async function getSidebarWidth(db: SqlDriver): Promise<Result<number | null>> {
  const stored = await getSetting(db, SIDEBAR_WIDTH_KEY);
  if (!stored.ok) return stored;
  if (stored.data === null) return ok(null);
  const width = Number(stored.data);
  return ok(Number.isFinite(width) ? width : null);
}

/** Persists the reader sidebar's width in pixels. */
export function setSidebarWidth(db: SqlDriver, width: number): Promise<Result<void>> {
  return setSetting(db, SIDEBAR_WIDTH_KEY, String(width));
}

const NOTES_SIDEBAR_WIDTH_KEY = 'reader.notesSidebarWidth';

/**
 * Reads the Notes sidebar's saved width in pixels. It is stored apart from the
 * reader sidebar's width so each panel keeps the size the reader gave it.
 *
 * @returns The width, or null when it was never saved or the stored value is not a finite number.
 */
export async function getNotesSidebarWidth(db: SqlDriver): Promise<Result<number | null>> {
  const stored = await getSetting(db, NOTES_SIDEBAR_WIDTH_KEY);
  if (!stored.ok) return stored;
  if (stored.data === null) return ok(null);
  const width = Number(stored.data);
  return ok(Number.isFinite(width) ? width : null);
}

/** Persists the Notes sidebar's width in pixels. */
export function setNotesSidebarWidth(db: SqlDriver, width: number): Promise<Result<void>> {
  return setSetting(db, NOTES_SIDEBAR_WIDTH_KEY, String(width));
}

const TARGET_LANGUAGE_KEY = 'translation.targetLanguage';

/**
 * Reads the Target language the reader chose in Settings.
 *
 * @returns The language code, or null when none was chosen or the stored code
 *   is no longer supported (so the caller falls back to the default).
 */
export async function getTargetLanguage(db: SqlDriver): Promise<Result<string | null>> {
  const stored = await getSetting(db, TARGET_LANGUAGE_KEY);
  if (!stored.ok) return stored;
  if (stored.data === null) return ok(null);
  return ok(isSupportedLanguage(stored.data) ? stored.data : null);
}

/**
 * Reads the Target language in effect: the reader's choice, or the default
 * derived from the system locale when they never chose one.
 *
 * @param systemLocale The OS locale reported by the platform, e.g. `pt-BR`.
 */
export async function getEffectiveTargetLanguage(
  db: SqlDriver,
  systemLocale: string,
): Promise<Result<string>> {
  const stored = await getTargetLanguage(db);
  if (!stored.ok) return stored;
  return ok(resolveTargetLanguage(stored.data, systemLocale));
}

/** Persists the reader's Target language; an unsupported code is rejected and nothing is saved. */
export async function setTargetLanguage(db: SqlDriver, code: string): Promise<Result<void>> {
  if (!isSupportedLanguage(code)) return err(`Unsupported Target language "${code}".`);
  return setSetting(db, TARGET_LANGUAGE_KEY, code);
}

const FOCUS_SOUND_KEY = 'focus.soundId';
const FOCUS_VOLUME_KEY = 'focus.volume';
const FOCUS_MINUTES_KEY = 'focus.minutes';

/**
 * Reads the Focus controls' remembered choices. Values that are missing,
 * unknown or out of range fall back to their defaults (no sound, default
 * volume, 25 minutes). These are local only and never synced.
 */
export async function getFocusPreferences(db: SqlDriver): Promise<Result<FocusPreferences>> {
  const soundId = await getSetting(db, FOCUS_SOUND_KEY);
  if (!soundId.ok) return soundId;
  const volume = await getSetting(db, FOCUS_VOLUME_KEY);
  if (!volume.ok) return volume;
  const minutes = await getSetting(db, FOCUS_MINUTES_KEY);
  if (!minutes.ok) return minutes;
  const resolved = resolveFocusPreferences({ soundId: soundId.data, volume: volume.data, minutes: minutes.data });
  // A stored Custom sound id is unknown to the bundled catalog, so it is checked against the reader's own sounds.
  const rememberedCustom = soundId.data !== null && resolved.soundId === null ? await isCustomSoundStored(db, soundId.data) : ok(false);
  if (!rememberedCustom.ok) return rememberedCustom;
  return ok(rememberedCustom.data ? { ...resolved, soundId: soundId.data } : resolved);
}

async function isCustomSoundStored(db: SqlDriver, soundId: string): Promise<Result<boolean>> {
  const contentHash = getCustomSoundHash(soundId);
  if (contentHash === null) return ok(false);
  try {
    return ok((await db.get('SELECT 1 AS found FROM custom_sounds WHERE content_hash = ?', [contentHash])) !== undefined);
  } catch (error) {
    return err(`Failed to look up Custom sound: ${errorMessage(error)}`);
  }
}

/**
 * Saves the given Focus choices, leaving the others as they were. Any invalid
 * value rejects the whole call and nothing is saved.
 */
export async function setFocusPreferences(db: SqlDriver, preferences: Partial<FocusPreferences>): Promise<Result<void>> {
  const { soundId, volume, minutes } = preferences;
  if (soundId !== undefined && soundId !== null && getAmbientSound(soundId) === null) {
    const stored = await isCustomSoundStored(db, soundId);
    if (!stored.ok) return stored;
    if (!stored.data) return err(`Unknown Ambient sound "${soundId}".`);
  }
  if (volume !== undefined && !(volume >= 0 && volume <= 1)) return err('Ambient sound volume must be from 0 to 1.');
  if (minutes !== undefined && !validateFocusMinutes(minutes).ok) return err('Focus timer length must be a whole number of minutes from 1 to 180.');
  const writes: Array<[string, string]> = [];
  if (soundId !== undefined) writes.push([FOCUS_SOUND_KEY, soundId ?? '']);
  if (volume !== undefined) writes.push([FOCUS_VOLUME_KEY, String(volume)]);
  if (minutes !== undefined) writes.push([FOCUS_MINUTES_KEY, String(minutes)]);
  for (const [key, value] of writes) {
    const saved = await setSetting(db, key, value);
    if (!saved.ok) return saved;
  }
  return ok(undefined);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
