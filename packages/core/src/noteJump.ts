import type { Annotation, ReadMode } from './models';

/**
 * What jumping to a Note can achieve in a given reader mode:
 * - `passage`: the quoted text can be found, so the view scrolls to it and flashes its highlight.
 * - `page`: the Note is not tied to a passage (a Page note), so the view just shows its page.
 * - `lost`: the Note quotes a passage that has no anchor in this mode, so the view can only
 *   show the page and tell the reader it could not find the text.
 */
export type NoteLocation = 'passage' | 'page' | 'lost';

/**
 * Decides how a jump to a Note can land in the given reader mode. Both anchors
 * are written when the Note is created (the one for the other mode is matched
 * on a best-effort basis), so a Note is found in either mode wherever that
 * matching succeeded; an anchor is only usable when all of its parts are set.
 *
 * @param annotation - The Note (or highlight) being jumped to.
 * @param mode - The reader mode the jump happens in.
 * @returns How precisely the jump can land; see `NoteLocation`.
 */
export function locateNote(annotation: Annotation, mode: ReadMode): NoteLocation {
  if (annotation.quote.trim().length === 0) return 'page';
  const anchored =
    mode === 'page'
      ? annotation.pageStart !== null && annotation.pageEnd !== null
      : annotation.paraIndex !== null && annotation.paraStart !== null && annotation.paraEnd !== null;
  return anchored ? 'passage' : 'lost';
}

/**
 * Picks the Note closest to where the reader is, so the Notes sidebar can open
 * scrolled to it. Distance is measured in pages: anchors only carry a position
 * within their own page, which is not comparable with a reading position that
 * differs between reader modes.
 *
 * @param notes - The listed Notes, in reading order (as `listNotes` returns them).
 * @param page - The real PDF page the reader is on.
 * @returns The nearest Note; on equal distance the earlier one in reading order
 *   (so the top of a page with several Notes, and the one above the reader when
 *   two are equally near), or null when there are no Notes.
 */
export function findNearestNote(notes: readonly Annotation[], page: number): Annotation | null {
  let nearest: Annotation | null = null;
  let nearestDistance = Infinity;
  for (const candidate of notes) {
    const distance = Math.abs(candidate.page - page);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}
