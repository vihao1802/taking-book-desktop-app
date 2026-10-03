import { useCallback, useEffect, useState } from 'react';
import { isOk, isPageNote, type Result } from '@taking-book/core';
import type { Annotation, AnnotationColor, CreateAnnotationInput, NoteDraft } from '@/reader-api';
import { useAnnotationEditActions } from './useAnnotationEditActions';

/**
 * What the reader can do to a stored annotation from its card. Each action
 * returns the outcome so the card can show a failure next to the control that
 * caused it; on success the annotation list is already up to date.
 */
export interface NoteEditActions {
  /** Saves the Note text; empty text on a Highlight removes only the text. */
  saveText: (id: number, text: string) => Promise<Result<Annotation>>;
  changeColor: (id: number, color: AnnotationColor) => Promise<Result<Annotation>>;
  /** Deletes the Note: the Highlight stays, unless it was a Page note, which goes entirely. */
  deleteNote: (id: number) => Promise<Result<Annotation | null>>;
  /** Deletes the whole annotation, Highlight and Note together. */
  deleteAnnotation: (id: number) => Promise<Result<void>>;
}

/**
 * Loads and mutates the highlights/notes for one book. Mutations optimistically
 * update local state and reload on error, keeping the reader responsive while a
 * slow sync backend is none of the UI's business.
 */
export function useAnnotations(fileHash: string): {
  annotations: Annotation[];
  error: string | null;
  create: (input: CreateAnnotationInput) => Promise<Annotation | null>;
  saveNoteDraft: (draft: NoteDraft) => Promise<Result<Annotation>>;
  editActions: NoteEditActions;
} {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.api.listAnnotations(fileHash);
    if (isOk(result)) setAnnotations(result.data);
    else setError(result.error);
  }, [fileHash]);

  useEffect(() => {
    setAnnotations([]);
    setError(null);
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: CreateAnnotationInput): Promise<Annotation | null> => {
      const result = await window.api.createAnnotation(fileHash, input);
      if (!isOk(result)) {
        setError(result.error);
        return null;
      }
      setAnnotations((prev) => [...prev, result.data]);
      return result.data;
    },
    [fileHash],
  );

  const saveNoteDraft = useCallback(
    async (draft: NoteDraft): Promise<Result<Annotation>> => {
      // A draft with no passage is a Page note, which is stored by its own rules.
      const result = isPageNote(draft)
        ? await window.api.savePageNote(fileHash, { page: draft.page, text: draft.text })
        : await window.api.saveNoteDraft(fileHash, draft);
      if (isOk(result)) setAnnotations((prev) => [...prev, result.data]);
      return result;
    },
    [fileHash],
  );

  const editActions = useAnnotationEditActions(setAnnotations);

  return { annotations, error, create, saveNoteDraft, editActions };
}