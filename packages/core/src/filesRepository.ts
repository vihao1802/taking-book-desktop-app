import type { BookFile, BookStatus, LastPosition, ReadMode } from './models';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver, SqlValue } from './sql';
import { tombstoneAnnotationsForFile } from './annotationsRepository';
import { defaultStamp, filesSchema as syncFilesSchema } from './sync/syncRepository';
import type { SyncStamp } from './sync/types';

interface FileRow {
  id: number;
  hash: string;
  path: string;
  title: string;
  status: string;
  tags: string;
  favorite: number;
  last_page: number | null;
  last_position: number | null;
  last_mode: string | null;
  page_count: number | null;
  zoom: number | null;
  created_at: string;
}

function toBookFile(row: FileRow): BookFile {
  return {
    id: row.id,
    hash: row.hash,
    path: row.path,
    title: row.title,
    status: row.status as BookStatus,
    tags: parseTags(row.tags),
    favorite: row.favorite === 1,
    lastPage: row.last_page,
    lastPosition: row.last_position,
    lastMode: parseMode(row.last_mode),
    pageCount: row.page_count,
    zoom: row.zoom,
    createdAt: row.created_at,
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    // A corrupt tags column is a storage defect, not a user error: degrade to
    // empty so the library still opens rather than crashing the reader.
    return [];
  }
}

function rowToRow(row: Record<string, SqlValue>): FileRow {
  return {
    id: Number(row.id),
    hash: String(row.hash),
    path: String(row.path),
    title: String(row.title),
    status: String(row.status),
    tags: String(row.tags),
    favorite: row.favorite == null ? 0 : Number(row.favorite),
    last_page: row.last_page == null ? null : Number(row.last_page),
    last_position: row.last_position == null ? null : Number(row.last_position),
    last_mode: row.last_mode == null ? null : String(row.last_mode),
    page_count: row.page_count == null ? null : Number(row.page_count),
    zoom: row.zoom == null ? null : Number(row.zoom),
    created_at: String(row.created_at),
  };
}

export interface UpsertFileInput {
  filePath: string;
  hash: string;
  title: string;
}

/** Returns the schema DDL to be executed once when a database is opened. */
export function filesSchema(): string {
  return syncFilesSchema();
}

/**
 * Registers a file in the library. If the same content hash already exists,
 * updates its path (a file may move between syncs) and returns the existing
 * record so last-read-position is preserved. Passing a stamp records the local
 * write for sync; without one the current time with an empty device id is used.
 */
export async function upsertFile(
  db: SqlDriver,
  input: UpsertFileInput,
  stamp?: SyncStamp,
): Promise<Result<BookFile>> {
  const { filePath, hash, title } = input;
  const clock = stamp ?? defaultStamp();
  try {
    const existing = await db.get('SELECT * FROM files WHERE hash = ?', [hash]);
    if (existing) {
      // Re-adding a file whose bytes match an existing (possibly tombstoned)
      // record revives it and repoints it at the new copy.
      await db.run('UPDATE files SET path = ?, updated_at = ?, updated_by = ?, deleted_at = NULL WHERE id = ?', [
        filePath,
        clock.updatedAt,
        clock.updatedBy,
        Number(existing.id),
      ]);
      const updated = await db.get('SELECT * FROM files WHERE id = ?', [Number(existing.id)]);
      if (!updated) return err('Updated file could not be read back');
      return ok(toBookFile(rowToRow(updated)));
    }
    const info = await db.run('INSERT INTO files (hash, path, title, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)', [
      hash,
      filePath,
      title,
      clock.updatedAt,
      clock.updatedBy,
    ]);
    const row = await db.get('SELECT * FROM files WHERE id = ?', [info.lastInsertRowid]);
    if (!row) return err('Inserted file could not be read back');
    return ok(toBookFile(rowToRow(row)));
  } catch (error) {
    return err(`Failed to register file "${filePath}": ${errorMessage(error)}`);
  }
}

/** Returns the resume position for a file, or null if it was never opened. */
export async function getLastPosition(db: SqlDriver, id: number): Promise<Result<LastPosition | null>> {
  try {
    const row = await db.get('SELECT last_page, last_position, last_mode FROM files WHERE id = ?', [id]);
    if (!row || row.last_page == null) return ok(null);
    return ok({
      page: Number(row.last_page),
      position: Number(row.last_position ?? 0),
      mode: parseMode(row.last_mode == null ? null : String(row.last_mode)),
    });
  } catch (error) {
    return err(`Failed to read last position for file ${id}: ${errorMessage(error)}`);
  }
}

/** Lists every live file in the library, newest first. Tombstoned files are hidden. */
export async function listFiles(db: SqlDriver): Promise<Result<BookFile[]>> {
  try {
    const rows = await db.all('SELECT * FROM files WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC');
    return ok(rows.map((row) => toBookFile(rowToRow(row))));
  } catch (error) {
    return err(`Failed to list files: ${errorMessage(error)}`);
  }
}

/** Sets the reading status (unread/reading/finished) for a file. */
export async function setFileStatus(
  db: SqlDriver,
  id: number,
  status: BookStatus,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE files SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [status, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No file with id ${id}`);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to set status for file ${id}: ${errorMessage(error)}`);
  }
}

/** Renames a file's display title. */
export async function setFileTitle(
  db: SqlDriver,
  id: number,
  title: string,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE files SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [title, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No file with id ${id}`);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to rename file ${id}: ${errorMessage(error)}`);
  }
}

/** Replaces the tag list for a file (duplicates removed, order preserved). */
export async function setFileTags(
  db: SqlDriver,
  id: number,
  tags: string[],
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const uniqueTags = [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE files SET tags = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [JSON.stringify(uniqueTags), clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No file with id ${id}`);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to set tags for file ${id}: ${errorMessage(error)}`);
  }
}

/** Marks a file as a favorite (starred) or removes the mark. */
export async function setFileFavorite(
  db: SqlDriver,
  id: number,
  favorite: boolean,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE files SET favorite = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [favorite ? 1 : 0, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No file with id ${id}`);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to set favorite for file ${id}: ${errorMessage(error)}`);
  }
}

/** Returns the saved zoom multiplier for a file, or null if the user never zoomed. */
export async function getFileZoom(db: SqlDriver, id: number): Promise<Result<number | null>> {
  try {
    const row = await db.get('SELECT zoom FROM files WHERE id = ?', [id]);
    return ok(row && row.zoom != null ? Number(row.zoom) : null);
  } catch (error) {
    return err(`Failed to read zoom for file ${id}: ${errorMessage(error)}`);
  }
}

/**
 * Persists the zoom multiplier a book was last read at so reopening restores
 * the same text/page size instead of resetting to 1.
 */
export async function setFileZoom(
  db: SqlDriver,
  id: number,
  zoom: number,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    await db.run(
      'UPDATE files SET zoom = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [zoom, clock.updatedAt, clock.updatedBy, id],
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to save zoom for file ${id}: ${errorMessage(error)}`);
  }
}

/** Records the total page count, known once the reader opens the document. */
export async function setFilePageCount(
  db: SqlDriver,
  id: number,
  pageCount: number,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE files SET page_count = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [pageCount, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No file with id ${id}`);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to set page count for file ${id}: ${errorMessage(error)}`);
  }
}

/**
 * Removes a file from the library by tombstoning it: the row stays so the
 * delete propagates to other devices, but the library view hides it. The
 * book's annotations are tombstoned under the same clock so their deletes
 * propagate too. Returns the stamp under which it was tombstoned so callers
 * can sync the change.
 */
export async function deleteFile(
  db: SqlDriver,
  id: number,
  stamp?: SyncStamp,
): Promise<Result<SyncStamp>> {
  const clock = stamp ?? defaultStamp();
  try {
    const row = await db.get('SELECT hash FROM files WHERE id = ?', [id]);
    if (!row) return err(`No file with id ${id}`);
    const result = await db.run(
      'UPDATE files SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [clock.updatedAt, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No live file with id ${id}`);
    const tombstoned = await tombstoneAnnotationsForFile(db, String(row.hash), clock);
    if (!tombstoned.ok) return tombstoned;
    return ok(clock);
  } catch (error) {
    return err(`Failed to delete file ${id}: ${errorMessage(error)}`);
  }
}

/**
 * Persists the resume position for a file. The mode records which reader view
 * the measurement came from, so reopening restores the same view instead of
 * letting one mode's coordinates clobber the other's.
 */
export async function saveLastPosition(
  db: SqlDriver,
  id: number,
  pos: LastPosition,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    await db.run(
      'UPDATE files SET last_page = ?, last_position = ?, last_mode = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [pos.page, pos.position, pos.mode, clock.updatedAt, clock.updatedBy, id],
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to save last position for file ${id}: ${errorMessage(error)}`);
  }
}

/** Interprets a stored last_mode value; legacy/unknown values read as 'page'. */
function parseMode(raw: string | null): ReadMode {
  return raw === 'reflow' ? 'reflow' : 'page';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
