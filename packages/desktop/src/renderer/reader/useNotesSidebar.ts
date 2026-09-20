import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { listNotes } from '@taking-book/core';
import type { Annotation } from '../../shared/types';
import { usePersistedSidebarWidth } from './usePersistedSidebarWidth';
import { getNotesPageInset } from './sidebar-width';

/** Everything a reader view needs to show the Notes sidebar and make room for it. */
export interface NotesSidebarState {
  open: boolean;
  toggle: () => void;
  /** Opens the sidebar if it is closed; does nothing when it is already open. */
  show: () => void;
  close: () => void;
  width: number;
  onWidthChange: (width: number) => void;
  showHighlights: boolean;
  onShowHighlightsChange: (show: boolean) => void;
  /** The Notes to list, in reading order. */
  notes: Annotation[];
  /** Pixels the page area must stay clear of on its right edge while the sidebar is open. */
  pageInset: number;
}

/**
 * State of the Notes sidebar, owned by the reader (above both reader modes) so
 * that it stays open, at the same width, across a page/reflow toggle. It starts
 * closed for every book, and its "show highlights too" filter is reset each time
 * it opens so the default view is always just the reader's own notes.
 *
 * @param annotations - The open book's live annotations.
 */
export function useNotesSidebar(annotations: Annotation[]): NotesSidebarState {
  const [open, setOpen] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [width, onWidthChange] = usePersistedSidebarWidth('notes');

  const toggle = useCallback(() => {
    setOpen((wasOpen) => !wasOpen);
    setShowHighlights(false);
  }, []);
  const show = useCallback(() => {
    // Opening resets the filter, exactly like the toggle; an already-open sidebar keeps the one the reader chose.
    if (!open) setShowHighlights(false);
    setOpen(true);
  }, [open]);
  const close = useCallback(() => setOpen(false), []);

  const notes = useMemo(() => listNotes(annotations, { includeHighlights: showHighlights }), [annotations, showHighlights]);
  // Dragging the sidebar wider re-lays-out every page; deferring the inset keeps
  // the panel itself following the pointer while the pages catch up.
  const pageInset = useDeferredValue(getNotesPageInset(open, width));

  return { open, toggle, show, close, width, onWidthChange, showHighlights, onShowHighlightsChange: setShowHighlights, notes, pageInset };
}
