import { useCallback, useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { Annotation, CreateAnnotationInput } from '../../shared/types';

/**
 * Loads and mutates the highlights/comments for one book. Mutations optimistically
 * update local state and reload on error, keeping the reader responsive while a
 * slow sync backend is none of the UI's business.
 */
export function useAnnotations(fileHash: string): {
  annotations: Annotation[];
  error: string | null;
  create: (input: CreateAnnotationInput) => Promise<Annotation | null>;
  setNote: (id: number, note: string | null) => Promise<void>;
  remove: (id: number) => Promise<void>;
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

  const setNote = useCallback(async (id: number, note: string | null) => {
    const result = await window.api.setAnnotationNote(id, note);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setAnnotations((prev) => prev.map((a) => (a.id === id ? result.data : a)));
  }, []);

  const remove = useCallback(async (id: number) => {
    const result = await window.api.deleteAnnotation(id);
    if (!isOk(result)) {
      setError(result.error);
      return;
    }
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { annotations, error, create, setNote, remove };
}