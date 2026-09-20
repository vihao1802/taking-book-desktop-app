import type { AnnotationUidGenerator } from './annotationUid';
import { deriveAnnotationUid, resolveAnnotationUid } from './annotationUid';
import type { Annotation, AnnotationColor, CreateAnnotationInput } from './models';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver, SqlValue } from './sql';
import { isNewerThan } from './sync/merge';
import { defaultStamp } from './sync/syncRepository';
import type { SyncAnnotation, SyncStamp } from './sync/types';

/**
 * Data access for reader annotations (Highlights and Notes). Each row carries
 * its own LWW clock and an optional tombstone so edits and deletes propagate
 * through the sync manifest like library records do.
 */

const COLORS: readonly AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];

interface AnnotationRow {
  id: number;
  uid: string | null;
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
    uid: row.uid == null ? null : String(row.uid),
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
    uid: rowUid(row),
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
    uid: rowUid(row),
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

/** The row's identity; rows not yet backfilled fall back to the derived one so they still match across devices. */
function rowUid(row: AnnotationRow): string {
  return resolveAnnotationUid(row.file_hash, { id: row.id, uid: row.uid });
}

function isColor(value: string): value is AnnotationColor {
  return (COLORS as readonly string[]).includes(value);
}

/**
 * Returns the schema DDL for the annotations table, plus its lookup index.
 * The per-book unique index on `uid` is created by `migrateAnnotationsSchema`
 * instead, because on a database from before uids the column does not exist
 * yet when this DDL runs.
 */
export function annotationsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT,
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
 * Brings an annotations table from before stable identities up to date: adds
 * the `uid` column, gives every existing row its deterministic uid (including
 * tombstones, so their deletes still line up across devices), and creates the
 * per-book unique index on `uid`. It does not touch any sync clock, because
 * assigning an identity is not an edit. Idempotent, so it is safe to run on
 * every start and on a fresh database.
 */
export async function migrateAnnotationsSchema(db: SqlDriver): Promise<Result<void>> {
  try {
    const columns = await db.all('PRAGMA table_info(annotations)');
    if (!columns.some((column) => String(column.name) === 'uid')) {
      await db.run('ALTER TABLE annotations ADD COLUMN uid TEXT');
    }
    const pending = await db.all('SELECT id, file_hash FROM annotations WHERE uid IS NULL');
    for (const row of pending) {
      const id = Number(row.id);
      await db.run('UPDATE annotations SET uid = ? WHERE id = ?', [
        deriveAnnotationUid(String(row.file_hash), id),
        id,
      ]);
    }
    await db.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_annotations_file_uid ON annotations(file_hash, uid)',
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to migrate annotations schema: ${errorMessage(error)}`);
  }
}

/**
 * Lists the live annotations for a book, in page order. Explicitly deleted
 * (tombstoned) rows are hidden, and so is everything while the book itself is
 * absent from the library: removing a book keeps its annotations stored, and
 * importing the same file again shows them once more. `listAnnotationsForSync`
 * still returns all of them so deletes and retained annotations reach other
 * devices.
 */
export async function listAnnotations(
  db: SqlDriver,
  fileHash: string,
): Promise<Result<Annotation[]>> {
  try {
    const rows = await db.all(
      `SELECT * FROM annotations
       WHERE file_hash = ? AND deleted_at IS NULL
         AND file_hash IN (SELECT hash FROM files WHERE deleted_at IS NULL)
       ORDER BY page, id`,
      [fileHash],
    );
    return ok(rows.map((row) => toAnnotation(rowToRow(row))));
  } catch (error) {
    return err(`Failed to list annotations for ${fileHash}: ${errorMessage(error)}`);
  }
}

/**
 * Lists the live annotations of every book in the library, for the Notes view.
 * Follows the same visibility rules as `listAnnotations`: deleted annotations
 * and those of books removed from the library are left out.
 */
export async function listLibraryAnnotations(db: SqlDriver): Promise<Result<Annotation[]>> {
  try {
    const rows = await db.all(
      `SELECT * FROM annotations
       WHERE deleted_at IS NULL
         AND file_hash IN (SELECT hash FROM files WHERE deleted_at IS NULL)
       ORDER BY file_hash, page, id`,
    );
    return ok(rows.map((row) => toAnnotation(rowToRow(row))));
  } catch (error) {
    return err(`Failed to list library annotations: ${errorMessage(error)}`);
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

/** Options for `createAnnotation`. */
export interface CreateAnnotationOptions {
  /** Supplies the annotation's globally stable uid; core has no platform randomness of its own. */
  generateUid: AnnotationUidGenerator;
  /** LWW clock for the write; defaults to the current time with an empty device id. */
  stamp?: SyncStamp;
}

/**
 * Records a new annotation (a Highlight, a Note or both). The two anchors (page text and reflow
 * paragraph) are both optional so either reader mode can create one; the
 * anchor for the other mode is filled in best-effort by the caller. The
 * annotation gets its uid from `options.generateUid`, once, and keeps it for
 * life so sync can match it across devices.
 */
export async function createAnnotation(
  db: SqlDriver,
  fileHash: string,
  input: CreateAnnotationInput,
  options: CreateAnnotationOptions,
): Promise<Result<Annotation>> {
  if (!isColor(input.color)) return err(`Unknown highlight color: ${input.color}`);
  const clock = options.stamp ?? defaultStamp();
  const uid = options.generateUid();
  try {
    const result = await db.run(
      `INSERT INTO annotations (uid, file_hash, page, page_start, page_end, quote, color, note,
         para_index, para_start, para_end, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uid,
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
    const row = await db.get('SELECT * FROM annotations WHERE id = ?', [result.lastInsertRowid]);
    if (!row) return err(`Annotation ${result.lastInsertRowid} vanished after insert`);
    return ok(toAnnotation(rowToRow(row)));
  } catch (error) {
    return err(`Failed to create annotation: ${errorMessage(error)}`);
  }
}

/**
 * Reads one live (not deleted) annotation by its local id.
 *
 * @param db - The data-access driver.
 * @param id - Local id of the annotation.
 * @returns The annotation, or an error message when it is missing or deleted.
 */
export async function getAnnotation(db: SqlDriver, id: number): Promise<Result<Annotation>> {
  try {
    const row = await db.get('SELECT * FROM annotations WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) return err(`No live annotation with id ${id}`);
    return ok(toAnnotation(rowToRow(row)));
  } catch (error) {
    return err(`Failed to read annotation ${id}: ${errorMessage(error)}`);
  }
}

/** Sets the raw text of the Note on an annotation; `saveNoteText` in `notesRepository` applies the saving rules on top. */
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

/**
 * Changes the highlight color of an annotation, stamping the edit so it syncs.
 *
 * @param db - The data-access driver.
 * @param id - Local id of the annotation to recolor.
 * @param color - One of the four highlight colors; anything else is rejected.
 * @param stamp - Optional sync clock for the edit.
 * @returns The updated annotation, or an error message when nothing changed.
 */
export async function setAnnotationColor(
  db: SqlDriver,
  id: number,
  color: AnnotationColor,
  stamp?: SyncStamp,
): Promise<Result<Annotation>> {
  if (!isColor(color)) return err(`Unknown highlight color: ${color}`);
  const clock = stamp ?? defaultStamp();
  try {
    const result = await db.run(
      'UPDATE annotations SET color = ?, updated_at = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [color, clock.updatedAt, clock.updatedBy, id],
    );
    if (result.changes === 0) return err(`No live annotation with id ${id}`);
    return getAnnotation(db, id);
  } catch (error) {
    return err(`Failed to set annotation color for ${id}: ${errorMessage(error)}`);
  }
}

/** Where a quote sits in the reflow view: a paragraph and a character range inside it. */
export interface ReflowAnchor {
  paraIndex: number;
  paraStart: number;
  paraEnd: number;
}

/**
 * Fills in the reflow anchor of an annotation made in page view, once the
 * reflow text exists to match it against. It is derived data, not an edit, so
 * the sync clock is left alone (like assigning a uid): stamping it would let a
 * backfill on this device win over a newer Note edit made on another one. An
 * anchor that is already set is never replaced.
 *
 * @param db - The data-access driver.
 * @param id - Local id of the annotation.
 * @param anchor - The paragraph range holding the annotation's quote.
 * @returns The annotation as stored, or an error message when it is missing or deleted.
 */
export async function setAnnotationReflowAnchor(
  db: SqlDriver,
  id: number,
  anchor: ReflowAnchor,
): Promise<Result<Annotation>> {
  try {
    await db.run(
      `UPDATE annotations SET para_index = ?, para_start = ?, para_end = ?
       WHERE id = ? AND para_index IS NULL AND deleted_at IS NULL`,
      [anchor.paraIndex, anchor.paraStart, anchor.paraEnd, id],
    );
    return getAnnotation(db, id);
  } catch (error) {
    return err(`Failed to set reflow anchor for annotation ${id}: ${errorMessage(error)}`);
  }
}

/** Where a quote sits in the page view: a character range into the page's joined text. */
export interface PageAnchor {
  pageStart: number;
  pageEnd: number;
}

/**
 * Fills in the page anchor of an annotation made in reflow view whose quote
 * could not be matched on the page then. Like `setAnnotationReflowAnchor` it is
 * derived data, so the sync clock is left alone and an anchor already set is
 * never replaced.
 *
 * @param db - The data-access driver.
 * @param id - Local id of the annotation.
 * @param anchor - The character range of the annotation's quote in the page text.
 * @returns The annotation as stored, or an error message when it is missing or deleted.
 */
export async function setAnnotationPageAnchor(
  db: SqlDriver,
  id: number,
  anchor: PageAnchor,
): Promise<Result<Annotation>> {
  try {
    await db.run(
      `UPDATE annotations SET page_start = ?, page_end = ?
       WHERE id = ? AND page_start IS NULL AND deleted_at IS NULL`,
      [anchor.pageStart, anchor.pageEnd, id],
    );
    return getAnnotation(db, id);
  } catch (error) {
    return err(`Failed to set page anchor for annotation ${id}: ${errorMessage(error)}`);
  }
}

/** Tombstones an annotation (a Highlight, a Note or both) so the delete propagates through sync. */
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

/**
 * Merges a book's annotations from a sync manifest into the local table,
 * resolving per-annotation conflicts by LWW so two devices can each add a
 * highlight without losing the other's. Annotations are matched by `uid`, never
 * by the local integer id (which two devices hand out independently); one
 * without a `uid` is matched by its derived one. The incoming list is
 * authoritative for the uids present in it; local-only annotations keep their
 * current state.
 */
export async function applyRecordAnnotations(
  db: SqlDriver,
  fileHash: string,
  remote: SyncAnnotation[],
): Promise<Result<void>> {
  try {
    const localRows = await db.all('SELECT * FROM annotations WHERE file_hash = ?', [fileHash]);
    const local = new Map(localRows.map((raw) => {
      const row = rowToRow(raw);
      return [rowUid(row), row] as const;
    }));
    for (const [uid, incoming] of newestByUid(fileHash, remote)) {
      const existing = local.get(uid);
      if (existing) await mergeIntoExisting(db, existing, incoming);
      else if (!incoming.deleted) await insertRemoteAnnotation(db, fileHash, uid, incoming);
    }
    return ok(undefined);
  } catch (error) {
    return err(`Failed to apply annotations for ${fileHash}: ${errorMessage(error)}`);
  }
}

/** Collapses a remote list to one annotation per uid, keeping the newest if a manifest repeats one. */
function newestByUid(fileHash: string, remote: SyncAnnotation[]): Map<string, SyncAnnotation> {
  const newest = new Map<string, SyncAnnotation>();
  for (const annotation of remote) {
    const uid = resolveAnnotationUid(fileHash, annotation);
    const seen = newest.get(uid);
    if (!seen || isNewerThan(annotation, seen)) newest.set(uid, annotation);
  }
  return newest;
}

/** Inserts an annotation first seen in a manifest; the local id is assigned here, not copied from the writer. */
async function insertRemoteAnnotation(
  db: SqlDriver,
  fileHash: string,
  uid: string,
  incoming: SyncAnnotation,
): Promise<void> {
  await db.run(
    `INSERT INTO annotations (uid, file_hash, page, page_start, page_end, quote, color, note,
       para_index, para_start, para_end, updated_at, updated_by, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      uid,
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
}

/** Applies an incoming version to the local row for the same uid when it is strictly newer. */
async function mergeIntoExisting(
  db: SqlDriver,
  existing: AnnotationRow,
  incoming: SyncAnnotation,
): Promise<void> {
  if (!isNewerThan(incoming, toSyncAnnotation(existing))) return;
  if (incoming.deleted) {
    await db.run(
      'UPDATE annotations SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [incoming.updatedAt, incoming.updatedAt, incoming.updatedBy, existing.id],
    );
    return;
  }
  await db.run(
    `UPDATE annotations SET page = ?, page_start = ?, page_end = ?, quote = ?, color = ?, note = ?,
       para_index = ?, para_start = ?, para_end = ?, updated_at = ?, updated_by = ?, deleted_at = NULL
     WHERE id = ?`,
    [
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
      existing.id,
    ],
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
