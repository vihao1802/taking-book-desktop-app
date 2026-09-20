import { useEffect, useRef } from 'react';
import type { Annotation } from '../../shared/types';
import type { NotesSidebarState } from './useNotesSidebar';

interface OpenToNoteOptions {
  /** The Note the reader chose in the Notes view; null when the book was opened normally. */
  note: Annotation | null;
  /**
   * True once the book's saved reader mode has been applied (so the jump is
   * planned for the right mode) and, in reflow mode, its text has been fully
   * extracted (so the highlight to flash exists and its paragraph anchor still
   * points at the same paragraph).
   */
  viewReady: boolean;
  /** The open book's live annotations, as loaded by the reader. */
  annotations: Annotation[];
  jumpToNote: (annotation: Annotation) => void;
  editAnnotation: NotesSidebarState['editAnnotation'];
}

/**
 * Carries out an arrival from the Notes view: once the book is showing in its
 * saved mode and the Note's Annotation has loaded (the highlight to flash is drawn
 * from that list), it opens the Notes sidebar on the Note's card and jumps to
 * where the Note was written. It happens once per opened book; a Note that was
 * deleted in the meantime never appears in the list, so the book just opens.
 */
export function useOpenToNote({ note, viewReady, annotations, jumpToNote, editAnnotation }: OpenToNoteOptions): void {
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current || !note || !viewReady) return;
    const stored = annotations.find((candidate) => candidate.id === note.id);
    if (!stored) return;
    doneRef.current = true;
    editAnnotation(stored);
    jumpToNote(stored);
  }, [note, viewReady, annotations, jumpToNote, editAnnotation]);
}
