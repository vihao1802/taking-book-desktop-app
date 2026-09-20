import type { CreateAnnotationOptions } from './annotationsRepository';
import { createAnnotation } from './annotationsRepository';
import type { Annotation, AnnotationColor, CreateAnnotationInput } from './models';
import type { Result } from './result';
import { err } from './result';
import type { SqlDriver } from './sql';

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
