import { parseCustomSoundName, type CustomSound } from './custom-sounds';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver } from './sql';

/**
 * DB access for Custom sounds: one row per distinct audio content, keyed by its
 * content hash. Local-only data: the audio files are large and the reader owns
 * their licence, so they are intentionally not part of the sync manifest.
 */

const INVALID_NAME_MESSAGE = 'Enter a name of up to 60 characters.';
const UNKNOWN_SOUND_MESSAGE = 'That sound no longer exists.';

/** Returns the schema DDL for the Custom sounds table. */
export function customSoundsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS custom_sounds (
      content_hash TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      added_order INTEGER NOT NULL
    );
  `;
}

/** What adding a Custom sound produced: the stored sound, and whether that audio was already there. */
export interface AddedCustomSound {
  sound: CustomSound;
  alreadyAdded: boolean;
}

/**
 * Stores a Custom sound, or returns the existing one when the same audio
 * content was added before (its name is kept, not replaced).
 */
export async function addCustomSound(db: SqlDriver, sound: CustomSound): Promise<Result<AddedCustomSound>> {
  try {
    const existing = await db.get('SELECT content_hash, name FROM custom_sounds WHERE content_hash = ?', [sound.contentHash]);
    if (existing) return ok({ sound: toCustomSound(existing), alreadyAdded: true });
    await db.run(
      'INSERT INTO custom_sounds (content_hash, name, added_order) VALUES (?, ?, (SELECT COALESCE(MAX(added_order), 0) + 1 FROM custom_sounds))',
      [sound.contentHash, sound.name],
    );
    return ok({ sound, alreadyAdded: false });
  } catch (error) {
    return err(`Failed to add Custom sound: ${errorMessage(error)}`);
  }
}

/** Lists every Custom sound on this device, in the order they were added. */
export async function listCustomSounds(db: SqlDriver): Promise<Result<CustomSound[]>> {
  try {
    const rows = await db.all('SELECT content_hash, name FROM custom_sounds ORDER BY added_order');
    return ok(rows.map(toCustomSound));
  } catch (error) {
    return err(`Failed to list Custom sounds: ${errorMessage(error)}`);
  }
}

/** Renames a Custom sound; the name is validated and trimmed first. */
export async function renameCustomSound(db: SqlDriver, contentHash: string, name: string): Promise<Result<void>> {
  const parsed = parseCustomSoundName(name);
  if (!parsed.ok) return err(INVALID_NAME_MESSAGE);
  try {
    const result = await db.run('UPDATE custom_sounds SET name = ? WHERE content_hash = ?', [parsed.data, contentHash]);
    return result.changes === 0 ? err(UNKNOWN_SOUND_MESSAGE) : ok(undefined);
  } catch (error) {
    return err(`Failed to rename Custom sound: ${errorMessage(error)}`);
  }
}

/** Removes a Custom sound's row. Deleting the audio copy is the platform's job. */
export async function deleteCustomSound(db: SqlDriver, contentHash: string): Promise<Result<void>> {
  try {
    await db.run('DELETE FROM custom_sounds WHERE content_hash = ?', [contentHash]);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to delete Custom sound: ${errorMessage(error)}`);
  }
}

function toCustomSound(row: Record<string, unknown>): CustomSound {
  return { contentHash: String(row.content_hash), name: String(row.name) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
