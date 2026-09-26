import { getLiveFileByHash, upsertFile } from './filesRepository';
import type { BookFile } from './models';
import type { Result } from './result';
import { err, isOk, ok } from './result';
import type { SqlDriver } from './sql';
import type { SyncStamp } from './sync/types';

/**
 * The file-system work an import needs, supplied by each platform so core
 * never imports Node or Electron. Every method may throw; a throw is treated
 * as that one file being unreadable.
 */
export interface ImportFileSystem {
  /** Whether the path is a regular file or a directory. */
  stat(path: string): Promise<'file' | 'directory'>;
  /** SHA-256 of the file's bytes, as lowercase hex. */
  hashFile(path: string): Promise<string>;
  /** Copies the file into the local blob store under its hash and returns the stored copy's path. */
  copyToStore(path: string, hash: string): Promise<string>;
}

/** Why a path was not imported: it is not a PDF, or it could not be read or copied. */
export type SkipReason = 'not-pdf' | 'unreadable';

/** A path that was not imported, named by its file name so the reader can tell which one. */
export interface SkippedImport {
  fileName: string;
  reason: SkipReason;
  /** The underlying error for an unreadable file, for the platform to log; null for a non-PDF. */
  detail: string | null;
}

/** What an import did, grouped the way the import notice reports it. */
export interface ImportSummary {
  /** Books that are new to the library, or were deleted earlier and have been revived. */
  added: BookFile[];
  /** Books whose content already matched a live Book; nothing was changed for them. */
  alreadyInLibrary: BookFile[];
  skipped: SkippedImport[];
}

export interface ImportBooksOptions {
  /** Absolute paths chosen by the reader, in the order they were chosen. */
  paths: string[];
  fileSystem: ImportFileSystem;
  stamp: SyncStamp;
}

type PathOutcome =
  | { kind: 'added' | 'alreadyInLibrary'; book: BookFile }
  | { kind: 'skipped'; skipped: SkippedImport }
  | { kind: 'repeat' };

type StatAndHash = { kind: 'directory' } | { kind: 'file'; hash: string };

/** One import in progress: its options plus the content already handled, so a repeat is counted once. */
interface ImportRun extends ImportBooksOptions {
  seenHashes: Set<string>;
}

/**
 * Imports Books from a list of file paths: keeps only PDFs (case-insensitive
 * extension), counts each file once (by path and by content), and registers
 * each file by content hash.
 * A file that cannot be read or copied is skipped and the rest continue; only
 * a library (database) failure aborts the whole import with an error.
 */
export async function importBooks(db: SqlDriver, options: ImportBooksOptions): Promise<Result<ImportSummary>> {
  const summary: ImportSummary = { added: [], alreadyInLibrary: [], skipped: [] };
  const run: ImportRun = { ...options, seenHashes: new Set() };
  for (const path of new Set(options.paths)) {
    const outcome = await importPath(db, path, run);
    if (!isOk(outcome)) return outcome;
    if (outcome.data.kind === 'skipped') summary.skipped.push(outcome.data.skipped);
    else if (outcome.data.kind !== 'repeat') summary[outcome.data.kind].push(outcome.data.book);
  }
  return ok(summary);
}

async function importPath(db: SqlDriver, path: string, run: ImportRun): Promise<Result<PathOutcome>> {
  const fileName = fileNameOf(path);
  const skip = (reason: SkipReason, detail: string | null = null): Result<PathOutcome> =>
    ok({ kind: 'skipped', skipped: { fileName, reason, detail } });
  if (!isPdfName(fileName)) return skip('not-pdf');

  const read = await statAndHash(path, run.fileSystem);
  if (!isOk(read)) return skip('unreadable', `Could not read ${path}: ${read.error}`);
  if (read.data.kind === 'directory') return skip('not-pdf');

  const { hash } = read.data;
  if (run.seenHashes.has(hash)) return ok({ kind: 'repeat' });
  run.seenHashes.add(hash);
  const live = await getLiveFileByHash(db, hash);
  if (!isOk(live)) return live;
  if (live.data) return ok({ kind: 'alreadyInLibrary', book: live.data });

  let storedPath: string;
  try {
    storedPath = await run.fileSystem.copyToStore(path, hash);
  } catch (error) {
    return skip('unreadable', `Could not copy ${path} into the local store: ${errorMessage(error)}`);
  }
  const title = titleFromFileName(fileName);
  const registered = await upsertFile(db, { filePath: storedPath, hash, title }, run.stamp);
  if (!isOk(registered)) return err(registered.error);
  return ok({ kind: 'added', book: registered.data });
}

/** Hashes a file; a directory is reported as such, since it has no bytes to hash. */
async function statAndHash(path: string, fileSystem: ImportFileSystem): Promise<Result<StatAndHash>> {
  try {
    if ((await fileSystem.stat(path)) === 'directory') return ok({ kind: 'directory' });
    return ok({ kind: 'file', hash: await fileSystem.hashFile(path) });
  } catch (error) {
    return err(errorMessage(error));
  }
}

/** Last segment of a POSIX or Windows path; core has no path module to lean on. */
function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

function isPdfName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
