import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { isOk, type Result } from '@taking-book/core';
import type { Annotation, AnnotationColor } from '@/reader-api';
import type { NoteEditActions } from './useAnnotations';

/**
 * Builds the edit actions of a Note card over a list of annotations held in
 * state, keeping that list in step with every stored change. It is shared by
 * the reader (one book's annotations) and the Notes view (the whole library's),
 * so a card behaves the same in both.
 *
 * @param setAnnotations - Updates the annotation list the cards were drawn from.
 */
export function useAnnotationEditActions(setAnnotations: Dispatch<SetStateAction<Annotation[]>>): NoteEditActions {
  const replaceAnnotation = useCallback(
    (updated: Annotation) => setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a))),
    [setAnnotations],
  );

  const saveText = useCallback(
    async (id: number, text: string): Promise<Result<Annotation>> => {
      const result = await window.api.saveNoteText(id, text);
      if (isOk(result)) replaceAnnotation(result.data);
      return result;
    },
    [replaceAnnotation],
  );

  const changeColor = useCallback(
    async (id: number, color: AnnotationColor): Promise<Result<Annotation>> => {
      const result = await window.api.setAnnotationColor(id, color);
      if (isOk(result)) replaceAnnotation(result.data);
      return result;
    },
    [replaceAnnotation],
  );

  const deleteNote = useCallback(
    async (id: number): Promise<Result<Annotation | null>> => {
      const result = await window.api.deleteNote(id);
      if (!isOk(result)) return result;
      if (result.data) replaceAnnotation(result.data);
      else setAnnotations((prev) => prev.filter((a) => a.id !== id));
      return result;
    },
    [replaceAnnotation, setAnnotations],
  );

  const deleteAnnotation = useCallback(
    async (id: number): Promise<Result<void>> => {
      const result = await window.api.deleteAnnotation(id);
      if (isOk(result)) setAnnotations((prev) => prev.filter((a) => a.id !== id));
      return result;
    },
    [setAnnotations],
  );

  return useMemo(() => ({ saveText, changeColor, deleteNote, deleteAnnotation }), [saveText, changeColor, deleteNote, deleteAnnotation]);
}
