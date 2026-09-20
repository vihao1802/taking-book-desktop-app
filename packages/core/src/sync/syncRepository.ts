import { applyRecordAnnotations, listAnnotationsForSync } from '../annotationsRepository';
import type { BookStatus, ReadMode } from '../models';
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
  favorite: number;
  last_page: number | null;
  last_position: number | null;
  last_mode: string | null;
  page_count: number | null;
  zoom: number | null;
  reflow_zoom: number | null;
  last_read_at: number | null;
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
    favorite: row.favorite == null ? 0 : Number(row.favorite),
    last_page: row.last_page == null ? null : Number(row.last_page),
    last_position: row.last_position == null ? null : Number(row.last_position),
    last_mode: row.last_mode == null ? null : String(row.last_mode),
    page_count: row.page_count == null ? null : Number(row.page_count),
    zoom: row.zoom == null ? null : Number(row.zoom),
    reflow_zoom: row.reflow_zoom == null ? null : Number(row.reflow_zoom),
    last_read_at: row.last_read_at == null ? null : Number(row.last_read_at),
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
    favorite: row.favorite === 1,
    lastPage: row.last_page,
    lastPosition: row.last_position,
    lastMode: row.last_mode === 'reflow' ? 'reflow' : row.last_mode === 'page' ? 'page' : null,
    pageCount: row.page_count,
    zoom: row.zoom,
    reflowZoom: row.reflow_zoom,
    lastReadAt: row.last_read_at,
    annotations: [],
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
      favorite INTEGER NOT NULL DEFAULT 0,
      last_page INTEGER,
      last_position REAL,
      last_mode TEXT,
      page_count INTEGER,
      zoom REAL,
      reflow_zoom REAL,
      last_read_at INTEGER,
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
    if (!names.has('favorite')) additions.push('favorite INTEGER NOT NULL DEFAULT 0');
    if (!names.has('page_count')) additions.push('page_count INTEGER');
    if (!names.has('last_mode')) additions.push('last_mode TEXT');
    if (!names.has('zoom')) additions.push('zoom REAL');
    if (!names.has('reflow_zoom')) additions.push('reflow_zoom REAL');
    if (!names.has('last_read_at')) additions.push('last_read_at INTEGER');
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
 * view must never show. Each record carries its LWW clock and the book's
 * annotations (with their own tombstones).
 */
export async function listRecordsForSync(db: SqlDriver): Promise<Result<SyncRecord[]>> {
  try {
    const rows = await db.all('SELECT * FROM files');
    const records: SyncRecord[] = [];
    for (const row of rows) {
      const record = toSyncRecord(rowToRow(row));
      const annotations = await listAnnotationsForSync(db, record.hash);
      if (annotations.ok) record.annotations = annotations.data;
      records.push(record);
    }
    return ok(records);
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
        // A tombstoned record has no book to add here, but its annotations are
        // still stored so importing the same file later brings them back.
        if (!record.deleted) {
          await insertFileRecord(db, record, await resolvePath(record.hash));
          counts.added += 1;
        }
        const applied = await applyRecordAnnotations(db, record.hash, record.annotations);
        if (!applied.ok) return applied;
        continue;
      }
      const row = rowToRow(existing);
      const deleted = record.deleted;
      const changed =
        row.title !== record.title ||
        row.status !== record.status ||
        parseTags(row.tags).join('|') !== record.tags.join('|') ||
        row.favorite !== (record.favorite ? 1 : 0) ||
        row.last_page !== record.lastPage ||
        row.last_position !== record.lastPosition ||
        (row.last_mode ?? null) !== record.lastMode ||
        row.page_count !== record.pageCount ||
        row.zoom !== record.zoom ||
        row.reflow_zoom !== (record.reflowZoom ?? null) ||
        row.last_read_at !== (record.lastReadAt ?? null) ||
        row.updated_at !== record.updatedAt ||
        row.updated_by !== record.updatedBy ||
        row.deleted_at != null !== deleted;
      if (changed) await updateFileRecord(db, row, record, counts);
      // Annotations merge by their own identity and clock, so they are applied
      // even when the book's own fields did not change: adding an annotation
      // never touches the book's clock.
      const applied = await applyRecordAnnotations(db, record.hash, record.annotations);
      if (!applied.ok) return applied;
    }
    return ok(counts);
  } catch (error) {
    return err(`Failed to apply sync records: ${errorMessage(error)}`);
  }
}

/** Writes a changed record onto its existing row and counts it as updated or deleted. */
async function updateFileRecord(
  db: SqlDriver,
  row: FileRow,
  record: SyncRecord,
  counts: ApplySyncCounts,
): Promise<void> {
  const deleted = record.deleted;
  await db.run(
    `UPDATE files SET title = ?, status = ?, tags = ?, favorite = ?, last_page = ?, last_position = ?, last_mode = ?, page_count = ?, zoom = ?, reflow_zoom = ?, last_read_at = ?,
       updated_at = ?, updated_by = ?, deleted_at = ? WHERE id = ?`,
    [
      record.title,
      record.status,
      JSON.stringify(record.tags),
      record.favorite ? 1 : 0,
      record.lastPage,
      record.lastPosition,
      record.lastMode,
      record.pageCount,
      record.zoom,
      record.reflowZoom ?? null,
      record.lastReadAt ?? null,
      record.updatedAt,
      record.updatedBy,
      deleted ? record.updatedAt : null,
      row.id,
    ],
  );
  if (deleted && row.deleted_at == null) counts.deleted += 1;
  else counts.updated += 1;
}

/** Inserts a brand-new local row for a live sync record that this device has never seen. */
async function insertFileRecord(db: SqlDriver, record: SyncRecord, path: string): Promise<void> {
  await db.run(
    `INSERT INTO files (hash, path, title, status, tags, favorite, last_page, last_position, last_mode, page_count, zoom, reflow_zoom, last_read_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.hash,
      path,
      record.title,
      record.status,
      JSON.stringify(record.tags),
      record.favorite ? 1 : 0,
      record.lastPage,
      record.lastPosition,
      record.lastMode,
      record.pageCount,
      record.zoom,
      record.reflowZoom ?? null,
      record.lastReadAt ?? null,
      record.updatedAt,
      record.updatedBy,
    ],
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
