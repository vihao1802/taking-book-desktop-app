import type { BookFile, BookStatus, LastPosition } from './models';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver, SqlValue } from './sql';
import { defaultStamp, filesSchema as syncFilesSchema } from './sync/syncRepository';
import type { SyncStamp } from './sync/types';

interface FileRow {
  id: number;
  hash: string;
  path: string;
  title: string;
  status: string;
  tags: string;
  last_page: number | null;
  last_position: number | null;
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
    lastPage: row.last_page,
    lastPosition: row.last_position,
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
    last_page: row.last_page == null ? null : Number(row.last_page),
    last_position: row.last_position == null ? null : Number(row.last_position),
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
      await db.run('UPDATE files SET path = ?, updated_at = ?, updated_by = ? WHERE id = ?', [
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
    const row = await db.get('SELECT last_page, last_position FROM files WHERE id = ?', [id]);
    if (!row || row.last_page == null) return ok(null);
    return ok({ page: Number(row.last_page), position: Number(row.last_position ?? 0) });
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

/**
 * Removes a file from the library by tombstoning it: the row stays so the
 * delete propagates to other devices, but the library view hides it. Returns
 * the stamp under which it was tombstoned so callers can sync the change.
 */
export async function deleteFile(
  db: SqlDriver,
  id: number,
  stamp?: SyncStamp,
): Promise<Result<SyncStamp>> {
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE files SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [clock.updatedAt, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No live file with id ${id}`);
    return ok(clock);
  } catch (error) {
    return err(`Failed to delete file ${id}: ${errorMessage(error)}`);
  }
}

/** Persists the resume position for a file. */
export async function saveLastPosition(
  db: SqlDriver,
  id: number,
  page: number,
  position: number,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    await db.run('UPDATE files SET last_page = ?, last_position = ?, updated_at = ?, updated_by = ? WHERE id = ?', [
      page,
      position,
      clock.updatedAt,
      clock.updatedBy,
      id,
    ]);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to save last position for file ${id}: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
