import { useCallback, useState } from 'react';
import { hasNoteText, isOk, isPageNote, type Result } from '@taking-book/core';
import type { Annotation, AnnotationColor } from '@/reader-api';
import type { NoteEditActions } from './useAnnotations';

/**
 * The delete the reader asked for and still has to confirm; null when none is pending.
 * `note` has one outcome (a Page note, which has no Highlight to keep). `either`
 * lets the reader choose between removing just the Note text and the whole Highlight.
 */
export type PendingDelete = 'note' | 'either' | null;

/** Everything an edit card needs to change one stored annotation in place. */
export interface NoteEditorState {
  text: string;
  changeText: (text: string) => void;
  pendingDelete: PendingDelete;
  busy: boolean;
  /** Why the last action failed, shown in the card; null otherwise. */
  error: string | null;
  changeColor: (color: AnnotationColor) => void;
  save: () => void;
  /**
   * The card's one delete control. A plain Highlight costs nothing to remake, so
   * it goes at once; anything holding the reader's writing asks first, offering
   * the choice between the Note only and the whole Highlight where both exist.
   */
  requestDelete: () => void;
  /** Deletes the Note text, keeping its Highlight (a Page note goes entirely). */
  confirmDeleteNote: () => void;
  /** Deletes the Highlight together with its Note. */
  confirmDeleteHighlight: () => void;
  cancelDelete: () => void;
}

interface UseNoteEditorOptions {
  annotation: Annotation;
  actions: NoteEditActions;
  /** Called once the annotation was saved or deleted, so the card can close. */
  onDone: () => void;
}

/**
 * Edit state of one annotation card: the text being typed, the delete the
 * reader still has to confirm, and the in-flight/failed status of each action.
 * Color changes are stored at once (a swatch click is a deliberate choice), the
 * text only on `save`. A delete that would lose written text waits for a
 * confirmation; a plain Highlight costs nothing to remake, so it goes at once.
 */
export function useNoteEditor({ annotation, actions, onDone }: UseNoteEditorOptions): NoteEditorState {
  const [text, setText] = useState(annotation.note ?? '');
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { id } = annotation;
  const holdsNote = hasNoteText(annotation);

  const run = useCallback(
    async (action: () => Promise<Result<unknown>>, closeWhenDone: boolean) => {
      setBusy(true);
      setError(null);
      const result = await action();
      setBusy(false);
      if (!isOk(result)) setError(result.error);
      else if (closeWhenDone) onDone();
    },
    [onDone],
  );

  const changeColor = useCallback((color: AnnotationColor) => void run(() => actions.changeColor(id, color), false), [run, actions, id]);
  const save = useCallback(() => {
    // Nothing to store: skip the write, which would only bump the sync clock.
    if (text.trim() === (annotation.note ?? '').trim()) onDone();
    else void run(() => actions.saveText(id, text), true);
  }, [run, actions, id, text, annotation.note, onDone]);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const deleteHighlight = useCallback(() => run(() => actions.deleteAnnotation(id), true), [run, actions, id]);
  const requestDelete = useCallback(() => {
    if (!holdsNote) void deleteHighlight();
    else setPendingDelete(isPageNote(annotation) ? 'note' : 'either');
  }, [holdsNote, annotation, deleteHighlight]);

  const confirmDeleteNote = useCallback(() => {
    setPendingDelete(null);
    void run(() => actions.deleteNote(id), true);
  }, [run, actions, id]);
  const confirmDeleteHighlight = useCallback(() => {
    setPendingDelete(null);
    void deleteHighlight();
  }, [deleteHighlight]);

  return { text, changeText: setText, pendingDelete, busy, error, changeColor, save, requestDelete, confirmDeleteNote, confirmDeleteHighlight, cancelDelete };
}
