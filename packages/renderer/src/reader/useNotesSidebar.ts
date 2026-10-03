import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { hasNoteText, listNotes } from '@taking-book/core';
import type { Annotation } from '@/reader-api';
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
  /** Local id of the annotation whose card is in edit mode; null when none is. */
  editingId: number | null;
  /** Local id of the annotation whose card is marked as selected (not editable); null when none is. */
  selectedId: number | null;
  /** Changes on every `editAnnotation`/`selectAnnotation`, so the list scrolls to the card again even when it is already the one in focus. */
  focusRequest: number;
  /**
   * Opens the sidebar and switches the annotation's card to edit mode. A plain
   * Highlight is not in the default list, so the filter is turned on for it.
   */
  editAnnotation: (annotation: Annotation) => void;
  /**
   * Opens the sidebar and marks the annotation's card as selected without
   * making it editable, so the reader can read the Note in context. The filter
   * rule is the same as for `editAnnotation`.
   */
  selectAnnotation: (annotation: Annotation) => void;
  stopEditing: () => void;
  /** Pixels the page area must stay clear of on its right edge while the sidebar is open. */
  pageInset: number;
}

/**
 * State of the Notes sidebar, owned by the reader (above both reader modes) so
 * that it stays open, at the same width, across a page/reflow toggle. It starts
 * closed for every book, and its "show highlights" filter is reset each time
 * it opens so the default view is always just the reader's own notes. It also
 * tracks which card is being edited, since a click on a highlight in either
 * reader view has to reach it.
 *
 * @param annotations - The open book's live annotations.
 */
export function useNotesSidebar(annotations: Annotation[]): NotesSidebarState {
  const [open, setOpen] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [width, onWidthChange] = usePersistedSidebarWidth('notes');

  const toggle = useCallback(() => {
    setOpen((wasOpen) => !wasOpen);
    setShowHighlights(false);
    setEditingId(null);
    setSelectedId(null);
  }, []);
  const show = useCallback(() => {
    // Opening resets the filter, exactly like the toggle; an already-open sidebar keeps the one the reader chose.
    if (!open) setShowHighlights(false);
    setOpen(true);
    // The draft card that opens with it is the one card being worked on.
    setEditingId(null);
    setSelectedId(null);
  }, [open]);
  const close = useCallback(() => {
    setOpen(false);
    setEditingId(null);
    setSelectedId(null);
  }, []);
  const stopEditing = useCallback(() => setEditingId(null), []);
  const focusCard = useCallback(
    (annotation: Annotation, focus: { editing: boolean }) => {
      // Same filter rule as opening: a closed sidebar starts from just the Notes, an open one keeps the reader's choice.
      setShowHighlights((current) => (hasNoteText(annotation) ? open && current : true));
      setOpen(true);
      setEditingId(focus.editing ? annotation.id : null);
      setSelectedId(focus.editing ? null : annotation.id);
      setFocusRequest((request) => request + 1);
    },
    [open],
  );
  const editAnnotation = useCallback((annotation: Annotation) => focusCard(annotation, { editing: true }), [focusCard]);
  const selectAnnotation = useCallback((annotation: Annotation) => focusCard(annotation, { editing: false }), [focusCard]);

  const notes = useMemo(() => listNotes(annotations, { includeHighlights: showHighlights }), [annotations, showHighlights]);
  // Dragging the sidebar wider re-lays-out every page; deferring the inset keeps
  // the panel itself following the pointer while the pages catch up.
  const pageInset = useDeferredValue(getNotesPageInset(open, width));

  return { open, toggle, show, close, width, onWidthChange, showHighlights, onShowHighlightsChange: setShowHighlights, notes, editingId, selectedId, focusRequest, editAnnotation, selectAnnotation, stopEditing, pageInset };
}
