import { useCallback } from 'react';
import type { ReflowParagraph } from '@taking-book/core';
import type { Annotation, AnnotationColor, CreateAnnotationInput, NoteAnchor } from '@/reader-api';
import { buildNoteAnchor } from './note-anchor';
import type { PageTextSelection } from './PdfPageView';
import type { NoteDraftState } from './useNoteDraft';
import type { NotesSidebarState } from './useNotesSidebar';

interface UseNoteActionsOptions {
  /** The book's reflow paragraphs, used to give a page selection its reflow anchor. */
  paragraphs: readonly ReflowParagraph[];
  /** The open book's live annotations. */
  annotations: Annotation[];
  create: (input: CreateAnnotationInput) => Promise<Annotation | null>;
  noteDraft: NoteDraftState;
  notesSidebar: NotesSidebarState;
}

/** What the page and reflow views call when the reader highlights text, adds a note or clicks a highlight. */
export interface NoteActions {
  /** Stores a highlight for a selection made in page view. */
  createFromPage: (selection: PageTextSelection, color: AnnotationColor) => Promise<Annotation | null>;
  /** Opens the Notes sidebar on a fresh draft card for the anchor. */
  startNote: (anchor: NoteAnchor) => void;
  startNoteFromPage: (selection: PageTextSelection) => void;
  /** Opens the card of a clicked highlight for editing. */
  openAnnotation: (annotation: Annotation) => void;
}

/**
 * The reader's entry points into Notes: highlighting, choosing "Add note", and
 * clicking an existing highlight. They are shared by the page and reflow views,
 * which differ only in how they build the anchor.
 */
export function useNoteActions({ paragraphs, annotations, create, noteDraft, notesSidebar }: UseNoteActionsOptions): NoteActions {
  const { start: startDraft } = noteDraft;
  const { show: showNotesSidebar, editAnnotation } = notesSidebar;

  const startNote = useCallback(
    (anchor: NoteAnchor) => {
      startDraft(anchor);
      showNotesSidebar();
    },
    [startDraft, showNotesSidebar],
  );
  // The draft's temporary highlight is painted like a stored one but has no
  // card to edit, so a click on it finds nothing in the stored list and is skipped.
  const openAnnotation = useCallback(
    (annotation: Annotation) => {
      const stored = annotations.find((candidate) => candidate.id === annotation.id);
      if (stored) editAnnotation(stored);
    },
    [annotations, editAnnotation],
  );
  const createFromPage = useCallback(
    (selection: PageTextSelection, color: AnnotationColor) => create({ ...buildNoteAnchor(paragraphs, selection), color, note: null }),
    [paragraphs, create],
  );
  const startNoteFromPage = useCallback(
    (selection: PageTextSelection) => startNote(buildNoteAnchor(paragraphs, selection)),
    [startNote, paragraphs],
  );

  return { createFromPage, startNote, startNoteFromPage, openAnnotation };
}
