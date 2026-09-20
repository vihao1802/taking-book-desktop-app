import type { Annotation, BookFile } from './models';
import { sortByRecentlyRead } from './recentlyRead';

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

/**
 * True for a Page note: an annotation (or a draft) with no quoted passage. It has no
 * Highlight, so unlike a Note on a Highlight it is nothing without its text.
 */
export function isPageNote(annotation: Pick<Annotation, 'quote'>): boolean {
  return annotation.quote.trim().length === 0;
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

/** One book's Notes as listed in the Notes view. */
export interface BookNotes {
  file: BookFile;
  notes: Annotation[];
}

export interface ListLibraryNotesOptions {
  /** Also list Highlights that carry no note text, like `listNotes`; independent of any per-book filter. */
  includeHighlights?: boolean;
  /** Case-insensitive text matched against book title, quoted passage and note text; blank matches everything. */
  query?: string;
}

function includesIgnoringCase(text: string, lowercaseQuery: string): boolean {
  return text.toLowerCase().includes(lowercaseQuery);
}

// A book whose title matches keeps all of its Notes: the reader is looking for
// that book, so narrowing its Notes further by the same words would hide them.
function searchBookNotes(group: BookNotes, lowercaseQuery: string): BookNotes {
  if (includesIgnoringCase(group.file.title, lowercaseQuery)) return group;
  const notes = group.notes.filter(
    (note) => includesIgnoringCase(note.quote, lowercaseQuery) || includesIgnoringCase(note.note ?? '', lowercaseQuery),
  );
  return { file: group.file, notes };
}

/**
 * Selects the Notes of every book in the library for the Notes view, grouped by
 * book.
 *
 * @param files - The books in the library; annotations of any other book are ignored.
 * @param annotations - Live annotations, possibly of several books, in any order.
 * @param options - `query` narrows the result to books and Notes matching that text.
 * @returns One group per book that has at least one Note to show, the most
 *   recently read book first, each group's Notes in reading order.
 */
export function listLibraryNotes(
  files: readonly BookFile[],
  annotations: readonly Annotation[],
  options: ListLibraryNotesOptions = {},
): BookNotes[] {
  const { includeHighlights = false, query = '' } = options;
  const lowercaseQuery = query.trim().toLowerCase();
  return sortByRecentlyRead([...files])
    .map((file) => ({
      file,
      notes: listNotes(
        annotations.filter((annotation) => annotation.fileHash === file.hash),
        { includeHighlights },
      ),
    }))
    .map((group) => (lowercaseQuery === '' ? group : searchBookNotes(group, lowercaseQuery)))
    .filter((group) => group.notes.length > 0);
}
