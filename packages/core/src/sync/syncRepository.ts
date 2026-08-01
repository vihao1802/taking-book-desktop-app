import type { BookStatus } from '../models';
import type { Result } from '../result';
import { err, ok } from '../result';
import type { SqlDriver, SqlValue } from '../sql';
import type { SyncRecord, SyncStamp } from './types';

/**
 * DB access for sync. The files table carries a per-record LWW clock
 * (`updated_at`, `updated_by`) and an optional tombstone (`deleted_at`), so
 * the local database can both produce and absorb a sync manifest.
 */

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
  updated_at: number;
  updated_by: string;
  deleted_at: number | null;
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
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
    updated_at: Number(row.updated_at ?? 0),
    updated_by: String(row.updated_by ?? ''),
    deleted_at: row.deleted_at == null ? null : Number(row.deleted_at),
  };
}

function toSyncRecord(row: FileRow): SyncRecord {
  return {
    hash: row.hash,
    title: row.title,
    status: row.status as BookStatus,
    tags: parseTags(row.tags),
    lastPage: row.last_page,
    lastPosition: row.last_position,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deleted: row.deleted_at != null,
  };
}

/**
 * Returns the schema DDL for the files table. New columns track the sync clock
 * and tombstones; the desktop migrates pre-existing databases with
 * `migrateFilesSchema` before first use.
 */
export function filesSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      path TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      tags TEXT NOT NULL DEFAULT '[]',
      last_page INTEGER,
      last_position REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL DEFAULT '',
      deleted_at INTEGER
    );
  `;
}

/** The default clock used when a caller does not supply one. */
export function defaultStamp(now: () => number = Date.now): SyncStamp {
  return { updatedAt: now(), updatedBy: '' };
}

/**
 * Adds the sync columns to a files table created by an older schema version.
 * Safe to run on a fresh database (columns already exist and are ignored).
 */
export async function migrateFilesSchema(db: SqlDriver): Promise<Result<void>> {
  try {
    const columns = await db.all('PRAGMA table_info(files)');
    const names = new Set(columns.map((col) => String(col.name)));
    const additions: string[] = [];
    if (!names.has('updated_at')) additions.push('updated_at INTEGER NOT NULL DEFAULT 0');
    if (!names.has('updated_by')) additions.push("updated_by TEXT NOT NULL DEFAULT ''");
    if (!names.has('deleted_at')) additions.push('deleted_at INTEGER');
    for (const column of additions) {
      await db.run(`ALTER TABLE files ADD COLUMN ${column}`);
    }
    return ok(undefined);
  } catch (error) {
    return err(`Failed to migrate files schema: ${errorMessage(error)}`);
  }
}

/**
 * Lists every record for sync — including tombstoned ones, which the library
 * view must never show. Each record carries its LWW clock.
 */
export async function listRecordsForSync(db: SqlDriver): Promise<Result<SyncRecord[]>> {
  try {
    const rows = await db.all('SELECT * FROM files');
    return ok(rows.map((row) => toSyncRecord(rowToRow(row))));
  } catch (error) {
    return err(`Failed to list sync records: ${errorMessage(error)}`);
  }
}

export interface ApplySyncCounts {
  added: number;
  updated: number;
  deleted: number;
}

/**
 * Applies merged records to the local database. Existing rows keep their path
 * and creation time; brand-new live records get `resolvePath(hash)` as their
 * path. Every statement is idempotent keyed by hash, so an interrupted apply
 * is healed by the next sync instead of corrupting the library.
 */
export async function applySyncRecords(
  db: SqlDriver,
  records: SyncRecord[],
  resolvePath: (hash: string) => string | Promise<string>,
): Promise<Result<ApplySyncCounts>> {
  const counts: ApplySyncCounts = { added: 0, updated: 0, deleted: 0 };
  try {
    for (const record of records) {
      const existing = await db.get('SELECT * FROM files WHERE hash = ?', [record.hash]);
      if (!existing) {
        if (record.deleted) continue;
        const path = await resolvePath(record.hash);
        await db.run(
          `INSERT INTO files (hash, path, title, status, tags, last_page, last_position, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.hash,
            path,
            record.title,
            record.status,
            JSON.stringify(record.tags),
            record.lastPage,
            record.lastPosition,
            record.updatedAt,
            record.updatedBy,
          ],
        );
        counts.added += 1;
        continue;
      }
      const row = rowToRow(existing);
      const deleted = record.deleted;
      const changed =
        row.title !== record.title ||
        row.status !== record.status ||
        parseTags(row.tags).join('|') !== record.tags.join('|') ||
        row.last_page !== record.lastPage ||
        row.last_position !== record.lastPosition ||
        row.updated_at !== record.updatedAt ||
        row.updated_by !== record.updatedBy ||
        row.deleted_at != null !== deleted;
      if (!changed) continue;
      await db.run(
        `UPDATE files SET title = ?, status = ?, tags = ?, last_page = ?, last_position = ?,
           updated_at = ?, updated_by = ?, deleted_at = ? WHERE id = ?`,
        [
          record.title,
          record.status,
          JSON.stringify(record.tags),
          record.lastPage,
          record.lastPosition,
          record.updatedAt,
          record.updatedBy,
          deleted ? record.updatedAt : null,
          row.id,
        ],
      );
      if (deleted && row.deleted_at == null) counts.deleted += 1;
      else counts.updated += 1;
    }
    return ok(counts);
  } catch (error) {
    return err(`Failed to apply sync records: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
