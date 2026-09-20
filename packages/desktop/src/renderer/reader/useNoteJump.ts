import { useCallback, useEffect, useRef, useState } from 'react';
import { locateNote, type NoteLocation } from '@taking-book/core';
import type { Annotation, ReadMode } from '../../shared/types';
import type { ReaderNotice } from './ReaderToast';

const NOT_LOCATED_MESSAGE = "Couldn't locate the text, showing the page";
/** Longer than a mode-switch confirmation: it is a sentence the reader has to read. */
const NOT_LOCATED_VISIBLE_MS = 2500;

/** A pending jump to a Note, handed to whichever reader view is on screen to carry out. */
export interface NoteJump {
  /** Distinguishes jumps to the same Note, so clicking its card twice jumps twice. */
  request: number;
  annotation: Annotation;
  /** How precisely the view can land, decided for the mode the jump was requested in. */
  location: NoteLocation;
}

/** Reports that a view finished a jump; `located` is false when it could not find the passage. */
export type FinishNoteJump = (request: number, located: boolean) => void;

interface NoteJumpState {
  noteJump: NoteJump | null;
  jumpToNote: (annotation: Annotation) => void;
  finishNoteJump: FinishNoteJump;
}

/**
 * Owns the pending jump to a Note, above both reader views: a card in the Notes
 * sidebar asks for a jump, the visible view (which knows how to scroll and where
 * the highlight is drawn) carries it out and reports back, and a passage that
 * could not be found becomes a toast. A jump is dropped when the mode changes so
 * the other view does not replay it.
 *
 * @param mode - The reader view that is currently showing.
 * @param showNotice - Shows a toast in the reader.
 */
export function useNoteJump(mode: ReadMode, showNotice: (notice: ReaderNotice) => void): NoteJumpState {
  const [noteJump, setNoteJump] = useState<NoteJump | null>(null);
  const requestCounterRef = useRef(0);
  // Views may report a finished jump more than once while React re-runs their
  // effects; only the first report for the live request counts.
  const activeRequestRef = useRef<number | null>(null);

  const jumpToNote = useCallback(
    (annotation: Annotation) => {
      requestCounterRef.current += 1;
      activeRequestRef.current = requestCounterRef.current;
      setNoteJump({ request: requestCounterRef.current, annotation, location: locateNote(annotation, mode) });
    },
    [mode],
  );

  const finishNoteJump = useCallback<FinishNoteJump>(
    (request, located) => {
      if (activeRequestRef.current !== request) return;
      activeRequestRef.current = null;
      setNoteJump(null);
      if (!located) showNotice({ id: Date.now(), message: NOT_LOCATED_MESSAGE, visibleMs: NOT_LOCATED_VISIBLE_MS });
    },
    [showNotice],
  );

  useEffect(() => {
    activeRequestRef.current = null;
    setNoteJump(null);
  }, [mode]);

  return { noteJump, jumpToNote, finishNoteJump };
}
