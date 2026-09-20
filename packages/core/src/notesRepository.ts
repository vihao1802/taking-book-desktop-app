import type { CreateAnnotationOptions } from './annotationsRepository';
import {
  createAnnotation,
  deleteAnnotation,
  getAnnotation,
  setAnnotationNote,
} from './annotationsRepository';
import { hasNoteText, isPageNote } from './notes';
import type { Annotation, AnnotationColor, CreateAnnotationInput } from './models';
import type { Result } from './result';
import { err, isErr, ok } from './result';
import type { SqlDriver } from './sql';
import type { SyncStamp } from './sync/types';

/**
 * The passage a reader selected and where to find it again: the same anchors a
 * stored annotation has (page text and reflow paragraph, either of which may be
 * null when the passage could not be matched in that mode).
 */
export type NoteAnchor = Omit<CreateAnnotationInput, 'color' | 'note'>;

/**
 * A Note the reader is still writing on a selected passage: the anchor plus the
 * highlight color and the unsaved text. Nothing about a draft is stored until
 * `saveNoteDraft`.
 */
export interface NoteDraft extends NoteAnchor {
  color: AnnotationColor;
  /** What the reader has typed so far; may be empty. */
  text: string;
}

/**
 * Stores a Note draft as an annotation on a book.
 *
 * Saving empty (or whitespace-only) text keeps the passage as a plain
 * Highlight instead of failing, so a reader can turn a note back into a
 * marking. Surrounding whitespace is trimmed, inner line breaks are kept. A
 * draft without a quoted passage would be a Page note, which is a separate
 * kind of Note, so it is rejected here.
 *
 * @param db - The data-access driver.
 * @param fileHash - Content hash of the book the draft belongs to.
 * @param draft - The passage, its anchors, the highlight color and the text.
 * @param options - The uid generator and optional sync clock for the new annotation.
 * @returns The stored annotation, or an error message when nothing was stored.
 */
export async function saveNoteDraft(
  db: SqlDriver,
  fileHash: string,
  draft: NoteDraft,
  options: CreateAnnotationOptions,
): Promise<Result<Annotation>> {
  if (draft.quote.trim().length === 0) return err('A note draft needs a quoted passage');
  const { text, ...anchor } = draft;
  const trimmed = text.trim();
  return createAnnotation(db, fileHash, { ...anchor, note: trimmed.length > 0 ? trimmed : null }, options);
}

/**
 * Replaces the text of an existing Note, or adds text to a plain Highlight.
 *
 * Saving empty (or whitespace-only) text on an annotation with a Highlight
 * removes only the text and keeps the Highlight. A Page note cannot lose its
 * text that way, since nothing would be left, so that is rejected and the
 * stored text stays as it was; deleting it is `deleteNote`'s job.
 *
 * @param db - The data-access driver.
 * @param id - Local id of the annotation to edit.
 * @param text - What the reader wrote; trimmed, inner line breaks kept.
 * @param stamp - Optional sync clock for the edit.
 * @returns The updated annotation, or an error message when nothing changed.
 */
export async function saveNoteText(
  db: SqlDriver,
  id: number,
  text: string,
  stamp?: SyncStamp,
): Promise<Result<Annotation>> {
  const current = await getAnnotation(db, id);
  if (isErr(current)) return current;
  const trimmed = text.trim();
  if (trimmed.length === 0 && isPageNote(current.data)) return err('A page note needs text');
  return setAnnotationNote(db, id, trimmed.length > 0 ? trimmed : null, stamp);
}

/**
 * Deletes the Note of an annotation: on a Highlight only the text goes and the
 * Highlight stays; a Page note is deleted entirely. A plain Highlight has no
 * Note, so asking to delete one is an error (remove the Highlight itself with
 * `deleteAnnotation`).
 *
 * @param db - The data-access driver.
 * @param id - Local id of the annotation whose Note is deleted.
 * @param stamp - Optional sync clock for the change.
 * @returns The Highlight that remains, or null when the whole annotation was
 *   deleted; an error message when there was no Note to delete.
 */
export async function deleteNote(db: SqlDriver, id: number, stamp?: SyncStamp): Promise<Result<Annotation | null>> {
  const current = await getAnnotation(db, id);
  if (isErr(current)) return current;
  if (!hasNoteText(current.data)) return err(`Annotation ${id} has no note to delete`);
  if (isPageNote(current.data)) {
    const deleted = await deleteAnnotation(db, id, stamp);
    return isErr(deleted) ? deleted : ok(null);
  }
  return setAnnotationNote(db, id, null, stamp);
}
