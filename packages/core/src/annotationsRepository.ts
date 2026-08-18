import type { Annotation, AnnotationColor, CreateAnnotationInput } from './models';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver, SqlValue } from './sql';
import { isNewerThan } from './sync/merge';
import { defaultStamp } from './sync/syncRepository';
import type { SyncAnnotation, SyncStamp } from './sync/types';

/**
 * Data access for reader annotations (highlights + comments). Each row carries
 * its own LWW clock and an optional tombstone so edits and deletes propagate
 * through the sync manifest like library records do.
 */

const COLORS: readonly AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];

interface AnnotationRow {
  id: number;
  file_hash: string;
  page: number;
  page_start: number | null;
  page_end: number | null;
  quote: string;
  color: string;
  note: string | null;
  para_index: number | null;
  para_start: number | null;
  para_end: number | null;
  created_at: string;
  updated_at: number;
  updated_by: string;
  deleted_at: number | null;
}

function rowToRow(row: Record<string, SqlValue>): AnnotationRow {
  return {
    id: Number(row.id),
    file_hash: String(row.file_hash),
    page: Number(row.page),
    page_start: row.page_start == null ? null : Number(row.page_start),
    page_end: row.page_end == null ? null : Number(row.page_end),
    quote: String(row.quote),
    color: String(row.color),
    note: row.note == null ? null : String(row.note),
    para_index: row.para_index == null ? null : Number(row.para_index),
    para_start: row.para_start == null ? null : Number(row.para_start),
    para_end: row.para_end == null ? null : Number(row.para_end),
    created_at: String(row.created_at),
    updated_at: Number(row.updated_at ?? 0),
    updated_by: String(row.updated_by ?? ''),
    deleted_at: row.deleted_at == null ? null : Number(row.deleted_at),
  };
}

function toAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    fileHash: row.file_hash,
    page: row.page,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    quote: row.quote,
    color: row.color as AnnotationColor,
    note: row.note,
    paraIndex: row.para_index,
    paraStart: row.para_start,
    paraEnd: row.para_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function toSyncAnnotation(row: AnnotationRow): SyncAnnotation {
  return {
    id: row.id,
    page: row.page,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    quote: row.quote,
    color: row.color as AnnotationColor,
    note: row.note,
    paraIndex: row.para_index,
    paraStart: row.para_start,
    paraEnd: row.para_end,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deleted: row.deleted_at != null,
  };
}

function isColor(value: string): value is AnnotationColor {
  return (COLORS as readonly string[]).includes(value);
}

/** Returns the schema DDL for the annotations table, plus its lookup index. */
export function annotationsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_hash TEXT NOT NULL,
      page INTEGER NOT NULL,
      page_start INTEGER,
      page_end INTEGER,
      quote TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'yellow',
      note TEXT,
      para_index INTEGER,
      para_start INTEGER,
      para_end INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT NOT NULL DEFAULT '',
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_file ON annotations(file_hash);
  `;
}

/**
 * Lists the live annotations for a book, oldest first. Tombstoned rows are
 * hidden here but still returned by `listAnnotationsForSync` so deletes reach
 * other devices.
 */
export async function listAnnotations(
  db: SqlDriver,
  fileHash: string,
): Promise<Result<Annotation[]>> {
  try {
    const rows = await db.all(
      'SELECT * FROM annotations WHERE file_hash = ? AND deleted_at IS NULL ORDER BY page, id',
      [fileHash],
    );
    return ok(rows.map((row) => toAnnotation(rowToRow(row))));
  } catch (error) {
    return err(`Failed to list annotations for ${fileHash}: ${errorMessage(error)}`);
  }
}

/** Lists every annotation for a book — including tombstones — for sync. */
export async function listAnnotationsForSync(
  db: SqlDriver,
  fileHash: string,
): Promise<Result<SyncAnnotation[]>> {
  try {
    const rows = await db.all(
      'SELECT * FROM annotations WHERE file_hash = ? ORDER BY id',
      [fileHash],
    );
    return ok(rows.map((row) => toSyncAnnotation(rowToRow(row))));
  } catch (error) {
    return err(`Failed to list sync annotations for ${fileHash}: ${errorMessage(error)}`);
  }
}

/**
 * Records a new highlight/comment. The two anchors (page text and reflow
 * paragraph) are both optional so either reader mode can create one; the
 * anchor for the other mode is filled in best-effort by the caller.
 */
export async function createAnnotation(
  db: SqlDriver,
  fileHash: string,
  input: CreateAnnotationInput,
  stamp?: SyncStamp,
): Promise<Result<Annotation>> {
  if (!isColor(input.color)) return err(`Unknown highlight color: ${input.color}`);
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      `INSERT INTO annotations (file_hash, page, page_start, page_end, quote, color, note,
         para_index, para_start, para_end, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fileHash,
        input.page,
        input.pageStart,
        input.pageEnd,
        input.quote,
        input.color,
        input.note,
        input.paraIndex,
        input.paraStart,
        input.paraEnd,
        clock.updatedAt,
        clock.updatedBy,
      ],
    );
    return ok(toAnnotation({
      ...rowToRow({
        file_hash: fileHash,
        page: input.page,
        page_start: input.pageStart,
        page_end: input.pageEnd,
        quote: input.quote,
        color: input.color,
        note: input.note,
        para_index: input.paraIndex,
        para_start: input.paraStart,
        para_end: input.paraEnd,
        created_at: '',
        updated_at: clock.updatedAt,
        updated_by: clock.updatedBy,
        deleted_at: null,
      } as Record<string, SqlValue>),
      id: result.lastInsertRowid,
    }));
  } catch (error) {
    return err(`Failed to create annotation: ${errorMessage(error)}`);
  }
}

/** Updates the comment attached to a highlight. */
export async function setAnnotationNote(
  db: SqlDriver,
  id: number,
  note: string | null,
  stamp?: SyncStamp,
): Promise<Result<Annotation>> {
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE annotations SET note = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [note, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No live annotation with id ${id}`);
    const row = await db.get('SELECT * FROM annotations WHERE id = ?', [id]);
    if (!row) return err(`No annotation with id ${id}`);
    return ok(toAnnotation(rowToRow(row)));
  } catch (error) {
    return err(`Failed to set annotation note for ${id}: ${errorMessage(error)}`);
  }
}

/** Tombstones a highlight so the delete propagates through sync. */
export async function deleteAnnotation(
  db: SqlDriver,
  id: number,
  stamp?: SyncStamp,
): Promise<Result<void>> {
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE annotations SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [clock.updatedAt, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No live annotation with id ${id}`);
    return ok(undefined);
  } catch (error) {
    return err(`Failed to delete annotation ${id}: ${errorMessage(error)}`);
  }
}

/** Tombstones every live annotation for a book, used when the file is deleted. */
export async function tombstoneAnnotationsForFile(
  db: SqlDriver,
  fileHash: string,
  stamp: SyncStamp,
): Promise<Result<void>> {
  try {
    await db.run(
      'UPDATE annotations SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE file_hash = ? AND deleted_at IS NULL',
      [stamp.updatedAt, stamp.updatedAt, stamp.updatedBy, fileHash],
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to tombstone annotations for ${fileHash}: ${errorMessage(error)}`);
  }
}

/**
 * Merges a book's annotations from a sync manifest into the local table,
 * resolving per-annotation conflicts by LWW so two devices can each add a
 * highlight without losing the other's. The incoming list is authoritative for
 * ids present in it; local-only ids keep their current state.
 */
export async function applyRecordAnnotations(
  db: SqlDriver,
  fileHash: string,
  remote: SyncAnnotation[],
): Promise<Result<void>> {
  try {
    const localRows = await db.all(
      'SELECT * FROM annotations WHERE file_hash = ?',
      [fileHash],
    );
    const local = new Map(localRows.map((row) => [Number(row.id), rowToRow(row)]));
    const byId = new Map(remote.map((a) => [a.id, a]));
    const ids = new Set<number>([...local.keys(), ...byId.keys()]);
    for (const id of ids) {
      const incoming = byId.get(id);
      const existing = local.get(id);
      if (!incoming) continue;
      if (!existing) {
        if (incoming.deleted) continue;
        await db.run(
          `INSERT INTO annotations (id, file_hash, page, page_start, page_end, quote, color, note,
             para_index, para_start, para_end, updated_at, updated_by, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            id,
            fileHash,
            incoming.page,
            incoming.pageStart,
            incoming.pageEnd,
            incoming.quote,
            incoming.color,
            incoming.note,
            incoming.paraIndex,
            incoming.paraStart,
            incoming.paraEnd,
            incoming.updatedAt,
            incoming.updatedBy,
          ],
        );
        continue;
      }
      const localSync: SyncAnnotation = {
        id,
        page: existing.page,
        pageStart: existing.page_start,
        pageEnd: existing.page_end,
        quote: existing.quote,
        color: existing.color as AnnotationColor,
        note: existing.note,
        paraIndex: existing.para_index,
        paraStart: existing.para_start,
        paraEnd: existing.para_end,
        updatedAt: existing.updated_at,
        updatedBy: existing.updated_by,
        deleted: existing.deleted_at != null,
      };
      const winner = isNewerThan(incoming, localSync) ? incoming : localSync;
      if (winner.deleted) {
        await db.run(
          'UPDATE annotations SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
          [winner.updatedAt, winner.updatedAt, winner.updatedBy, id],
        );
      } else {
        await db.run(
          `UPDATE annotations SET page = ?, page_start = ?, page_end = ?, quote = ?, color = ?, note = ?,
             para_index = ?, para_start = ?, para_end = ?, updated_at = ?, updated_by = ?, deleted_at = NULL
           WHERE id = ?`,
          [
            winner.page,
            winner.pageStart,
            winner.pageEnd,
            winner.quote,
            winner.color,
            winner.note,
            winner.paraIndex,
            winner.paraStart,
            winner.paraEnd,
            winner.updatedAt,
            winner.updatedBy,
            id,
          ],
        );
      }
    }
    return ok(undefined);
  } catch (error) {
    return err(`Failed to apply annotations for ${fileHash}: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
