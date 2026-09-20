import { useMemo } from 'react';
import type { ReadMode, ReflowParagraph } from '@taking-book/core';
import type { Annotation, CreateAnnotationInput } from '../../shared/types';
import type { ReaderNotice } from './ReaderToast';
import { useAnnotations, type NoteEditActions } from './useAnnotations';
import { useNoteActions, type NoteActions } from './useNoteActions';
import { useNoteDraft, type NoteDraftState } from './useNoteDraft';
import { useNoteJump, type FinishNoteJump, type NoteJump } from './useNoteJump';
import { useNotesSidebar, type NotesSidebarState } from './useNotesSidebar';
import { useOpenToNote } from './useOpenToNote';
import { useReflowAnchors } from './useReflowAnchors';

interface UseReaderNotesOptions {
  fileHash: string;
  mode: ReadMode;
  paragraphs: readonly ReflowParagraph[];
  /** True once reflow extraction has finished, so the paragraphs are final. */
  reflowTextReady: boolean;
  showNotice: (notice: ReaderNotice) => void;
  /** A Note chosen in the Notes view: the book opens at it with the Notes sidebar on its card. Null for a normal open. */
  noteToOpen: Annotation | null;
  /** True once a jump can be planned in the right mode; see `useOpenToNote`. */
  viewReady: boolean;
}

/** What the reader hands to its page and reflow views, and to its own chrome, for Notes. */
export interface ReaderNotes extends NoteActions {
  create: (input: CreateAnnotationInput) => Promise<Annotation | null>;
  editActions: NoteEditActions;
  notesSidebar: NotesSidebarState;
  noteDraft: NoteDraftState;
  noteJump: NoteJump | null;
  jumpToNote: (annotation: Annotation) => void;
  finishNoteJump: FinishNoteJump;
  /** The stored annotations plus the draft's temporary highlight, as painted on the page. */
  paintedAnnotations: Annotation[];
}

/**
 * Everything the reader needs for Notes, owned above both reader modes so the
 * sidebar, an unsaved draft and a pending jump survive a page/reflow toggle:
 * the book's annotations, the Notes sidebar, the draft card, jumping to a Note,
 * and the arrival from the Notes view.
 */
export function useReaderNotes({ fileHash, mode, paragraphs, reflowTextReady, showNotice, noteToOpen, viewReady }: UseReaderNotesOptions): ReaderNotes {
  const { annotations: storedAnnotations, create, saveNoteDraft, editActions } = useAnnotations(fileHash);
  const annotations = useReflowAnchors({ annotations: storedAnnotations, paragraphs, reflowTextReady });
  const notesSidebar = useNotesSidebar(annotations);
  const noteDraft = useNoteDraft({ fileHash, saveNote: saveNoteDraft });
  const { noteJump, jumpToNote, finishNoteJump } = useNoteJump(mode, showNotice);
  const actions = useNoteActions({ paragraphs, annotations, create, noteDraft, notesSidebar });
  useOpenToNote({ note: noteToOpen, viewReady, annotations, jumpToNote, selectAnnotation: notesSidebar.selectAnnotation });

  // The draft's passage is painted as a temporary highlight next to the saved
  // ones, but stays out of the Notes list, which only shows what is stored.
  const { highlight: draftHighlight } = noteDraft;
  const paintedAnnotations = useMemo(
    () => (draftHighlight ? [...annotations, draftHighlight] : annotations),
    [annotations, draftHighlight],
  );

  return { create, editActions, notesSidebar, noteDraft, noteJump, jumpToNote, finishNoteJump, paintedAnnotations, ...actions };
}
