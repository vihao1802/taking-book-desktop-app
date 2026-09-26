import { MAX_CUSTOM_SOUND_BYTES, defaultCustomSoundName, validateCustomSoundFile, type CustomSound, type CustomSoundError } from './custom-sounds';
import { addCustomSound, deleteCustomSound } from './customSoundsRepository';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver } from './sql';

/** The file operations adding Custom sounds needs; each platform supplies its own. */
export interface CustomSoundFileSystem {
  /** The file's size in bytes. Rejects when the file cannot be read. */
  sizeOf(path: string): Promise<number>;
  /** SHA-256 of the file's contents, as lowercase hex. */
  hashFile(path: string): Promise<string>;
  /** Keeps a copy of the file in the app's own store, named by its content hash. */
  copyToStore(path: string, hash: string): Promise<void>;
}

/** A picked file that was not added, with a reason the reader can act on. */
export interface RejectedCustomSound {
  fileName: string;
  reason: string;
  /** The underlying error, for the platform to log; not meant for the reader. */
  detail?: string;
}

/** What adding a batch of files did: the new sounds, how many were already there, and the files that were refused. */
export interface AddCustomSoundsSummary {
  added: CustomSound[];
  alreadyAdded: number;
  rejected: RejectedCustomSound[];
}

const REJECTION_REASONS: Record<CustomSoundError, string> = {
  'invalid-name': 'The file name cannot be used as a name.',
  'empty-file': 'The file is empty.',
  'file-too-large': `The file is over ${MAX_CUSTOM_SOUND_BYTES / (1024 * 1024)} MB.`,
};
const UNREADABLE_REASON = 'The file could not be read.';

/**
 * Adds audio files as Custom sounds. A file that breaks the rules or cannot be
 * read is reported and skipped; it never stops the rest of the batch.
 *
 * @param db - The app database.
 * @param options.paths - The audio files the reader picked.
 * @param options.fileSystem - Platform file access.
 * @returns What was added, what was already there, and what was rejected.
 */
export async function addCustomSounds(
  db: SqlDriver,
  options: { paths: string[]; fileSystem: CustomSoundFileSystem },
): Promise<Result<AddCustomSoundsSummary>> {
  const summary: AddCustomSoundsSummary = { added: [], alreadyAdded: 0, rejected: [] };
  for (const path of options.paths) {
    const fileName = path.split(/[\\/]/).pop() ?? path;
    const outcome = await addOne(db, path, options.fileSystem);
    if (!outcome.ok) return outcome;
    if (outcome.data.kind === 'rejected') summary.rejected.push({ fileName, reason: outcome.data.reason, detail: outcome.data.detail });
    else if (outcome.data.kind === 'already-added') summary.alreadyAdded += 1;
    else summary.added.push(outcome.data.sound);
  }
  return ok(summary);
}

type AddOutcome = { kind: 'added'; sound: CustomSound } | { kind: 'already-added' } | { kind: 'rejected'; reason: string; detail?: string };

async function addOne(db: SqlDriver, path: string, fileSystem: CustomSoundFileSystem): Promise<Result<AddOutcome>> {
  let contentHash: string;
  try {
    const size = validateCustomSoundFile({ sizeBytes: await fileSystem.sizeOf(path) });
    if (!size.ok) return ok({ kind: 'rejected', reason: REJECTION_REASONS[size.error] });
    contentHash = await fileSystem.hashFile(path);
  } catch (error) {
    return ok({ kind: 'rejected', reason: UNREADABLE_REASON, detail: errorMessage(error) });
  }
  const added = await addCustomSound(db, { contentHash, name: defaultCustomSoundName(path) });
  if (!added.ok) return err(added.error);
  if (added.data.alreadyAdded) return ok({ kind: 'already-added' });
  try {
    await fileSystem.copyToStore(path, contentHash);
  } catch (error) {
    // Without its audio copy the row would list a sound that can never play.
    await deleteCustomSound(db, contentHash);
    return ok({ kind: 'rejected', reason: UNREADABLE_REASON, detail: errorMessage(error) });
  }
  return ok({ kind: 'added', sound: added.data.sound });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
