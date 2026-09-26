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
  /**
   * Full paths of a directory's direct children. Should leave out links back
   * into a directory, so a folder that links to its own parent cannot make the walk endless.
   */
  listDirectory(path: string): Promise<string[]>;
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

/** How far an import has got: PDFs handled so far out of all the PDFs found. */
export interface ImportProgress {
  done: number;
  total: number;
}

export interface ImportBooksOptions {
  /** Absolute paths of files or folders chosen by the reader, in the order they were chosen. */
  paths: string[];
  fileSystem: ImportFileSystem;
  stamp: SyncStamp;
  /**
   * Called once the PDFs are found (done 0) and after each one is handled, so
   * a long import can show how far it has got. Not called when no PDF was found.
   */
  onProgress?: (progress: ImportProgress) => void;
}

type PathOutcome =
  | { kind: 'added' | 'alreadyInLibrary'; book: BookFile }
  | { kind: 'skipped'; skipped: SkippedImport }
  | { kind: 'repeat' };

/** What walking the chosen paths found: the PDFs to import, and everything skipped on the way. */
interface FoundPaths {
  pdfPaths: string[];
  skipped: SkippedImport[];
}

/** One import in progress: its options plus the content already handled, so a repeat is counted once. */
interface ImportRun extends ImportBooksOptions {
  seenHashes: Set<string>;
}

/**
 * Imports Books from files and folders: searches folders and all their
 * subfolders, keeps only PDFs (case-insensitive extension), counts each file
 * once (by path and by content), and registers each file by content hash.
 * The walk finishes before any PDF is imported, so progress reports a fixed
 * total: `onProgress` gets done/total before the first PDF and after each one.
 * A file or folder that cannot be read, or a file that cannot be copied, is
 * skipped and the rest continue; only a library (database) failure aborts the
 * whole import with an error.
 */
export async function importBooks(db: SqlDriver, options: ImportBooksOptions): Promise<Result<ImportSummary>> {
  const found = await findPdfs(options.paths, options.fileSystem);
  const summary: ImportSummary = { added: [], alreadyInLibrary: [], skipped: found.skipped };
  const run: ImportRun = { ...options, seenHashes: new Set() };
  const total = found.pdfPaths.length;
  if (total > 0) options.onProgress?.({ done: 0, total });
  for (const [index, path] of found.pdfPaths.entries()) {
    const outcome = await importPdf(db, path, run);
    if (!isOk(outcome)) return outcome;
    if (outcome.data.kind === 'skipped') summary.skipped.push(outcome.data.skipped);
    else if (outcome.data.kind !== 'repeat') summary[outcome.data.kind].push(outcome.data.book);
    options.onProgress?.({ done: index + 1, total });
  }
  return ok(summary);
}

/** Walks the chosen paths into the PDFs they hold, visiting each path once however it was reached. */
async function findPdfs(paths: string[], fileSystem: ImportFileSystem): Promise<FoundPaths> {
  const found: FoundPaths = { pdfPaths: [], skipped: [] };
  const walk: Walk = { fileSystem, found, visited: new Set() };
  for (const path of paths) await walkPath(path, walk);
  return found;
}

/** One walk over the chosen paths, and the paths it has visited so far. */
interface Walk {
  fileSystem: ImportFileSystem;
  found: FoundPaths;
  visited: Set<string>;
}

async function walkPath(path: string, walk: Walk): Promise<void> {
  if (walk.visited.has(path)) return;
  walk.visited.add(path);
  const skipUnreadable = (action: string, error: unknown): void => {
    const detail = `Could not ${action} ${path}: ${errorMessage(error)}`;
    walk.found.skipped.push({ fileName: fileNameOf(path), reason: 'unreadable', detail });
  };
  let children: string[];
  try {
    if ((await walk.fileSystem.stat(path)) === 'file') return collectFile(path, walk.found);
    children = await walk.fileSystem.listDirectory(path);
  } catch (error) {
    return skipUnreadable('read', error);
  }
  for (const child of children) await walkPath(child, walk);
}

function collectFile(path: string, found: FoundPaths): void {
  const fileName = fileNameOf(path);
  if (isPdfName(fileName)) found.pdfPaths.push(path);
  else found.skipped.push({ fileName, reason: 'not-pdf', detail: null });
}

async function importPdf(db: SqlDriver, path: string, run: ImportRun): Promise<Result<PathOutcome>> {
  const fileName = fileNameOf(path);
  const skip = (detail: string): Result<PathOutcome> =>
    ok({ kind: 'skipped', skipped: { fileName, reason: 'unreadable', detail } });

  let hash: string;
  try {
    hash = await run.fileSystem.hashFile(path);
  } catch (error) {
    return skip(`Could not read ${path}: ${errorMessage(error)}`);
  }
  if (run.seenHashes.has(hash)) return ok({ kind: 'repeat' });
  run.seenHashes.add(hash);
  const live = await getLiveFileByHash(db, hash);
  if (!isOk(live)) return live;
  if (live.data) return ok({ kind: 'alreadyInLibrary', book: live.data });

  let storedPath: string;
  try {
    storedPath = await run.fileSystem.copyToStore(path, hash);
  } catch (error) {
    return skip(`Could not copy ${path} into the local store: ${errorMessage(error)}`);
  }
  const title = titleFromFileName(fileName);
  const registered = await upsertFile(db, { filePath: storedPath, hash, title }, run.stamp);
  if (!isOk(registered)) return err(registered.error);
  return ok({ kind: 'added', book: registered.data });
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
