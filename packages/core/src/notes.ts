import type { Annotation } from './models';

export interface ListNotesOptions {
  /** Also list Highlights that carry no note text. Off by default so writing is not buried by markings. */
  includeHighlights?: boolean;
}

/**
 * True when the annotation carries note text a reader actually wrote; blank or
 * whitespace-only text does not count, so it is the one test for "is a Note".
 */
export function hasNoteText(annotation: Annotation): boolean {
  return annotation.note !== null && annotation.note.trim().length > 0;
}

// An annotation with no page-text anchor (a Page note, or a highlight made in
// reflow whose text could not be matched on the page) has no offset to compare,
// so it sorts ahead of anchored ones: it speaks about the page as a whole.
function compareWithinPage(a: Annotation, b: Annotation): number {
  const aStart = a.pageStart ?? -1;
  const bStart = b.pageStart ?? -1;
  if (aStart !== bStart) return aStart - bStart;
  const aPara = a.paraIndex ?? -1;
  const bPara = b.paraIndex ?? -1;
  if (aPara !== bPara) return aPara - bPara;
  return (a.paraStart ?? -1) - (b.paraStart ?? -1);
}

function compareInReadingOrder(a: Annotation, b: Annotation): number {
  if (a.page !== b.page) return a.page - b.page;
  const within = compareWithinPage(a, b);
  return within !== 0 ? within : a.id - b.id;
}

/**
 * Selects the Notes of one book from its live annotations, in reading order.
 *
 * @param annotations - The book's live (not deleted) annotations, in any order.
 * @param options - `includeHighlights` also lists Highlights without note text.
 * @returns A new list ordered by page, then position within the page, then
 *   creation order; the input list is left untouched.
 */
export function listNotes(annotations: readonly Annotation[], options: ListNotesOptions = {}): Annotation[] {
  const { includeHighlights = false } = options;
  return annotations
    .filter((annotation) => includeHighlights || hasNoteText(annotation))
    .sort(compareInReadingOrder);
}
