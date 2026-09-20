import { useCallback, useState } from 'react';
import { hasNoteText, isOk, type Result } from '@taking-book/core';
import type { Annotation, AnnotationColor } from '../../shared/types';
import type { NoteEditActions } from './useAnnotations';

/** Which delete the reader asked for and still has to confirm; null when none is pending. */
export type PendingDelete = 'note' | 'highlight' | null;

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
  /** Deletes the Note, first asking for confirmation because it holds the reader's writing. */
  requestDeleteNote: () => void;
  /** Deletes the Highlight; immediate for a plain Highlight, confirmed when it carries a Note. */
  requestDeleteHighlight: () => void;
  confirmDelete: () => void;
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
  const requestDeleteNote = useCallback(() => setPendingDelete('note'), []);
  const cancelDelete = useCallback(() => setPendingDelete(null), []);

  const deleteHighlight = useCallback(() => run(() => actions.deleteAnnotation(id), true), [run, actions, id]);
  const requestDeleteHighlight = useCallback(() => {
    if (holdsNote) setPendingDelete('highlight');
    else void deleteHighlight();
  }, [holdsNote, deleteHighlight]);

  const confirmDelete = useCallback(() => {
    const confirmed = pendingDelete;
    setPendingDelete(null);
    if (confirmed === 'note') void run(() => actions.deleteNote(id), true);
    else if (confirmed === 'highlight') void deleteHighlight();
  }, [pendingDelete, run, actions, id, deleteHighlight]);

  return { text, changeText: setText, pendingDelete, busy, error, changeColor, save, requestDeleteNote, requestDeleteHighlight, confirmDelete, cancelDelete };
}
