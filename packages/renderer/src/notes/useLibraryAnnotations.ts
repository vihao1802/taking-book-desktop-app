import { useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { Annotation } from '@/reader-api';
import { useAnnotationEditActions } from '../reader/useAnnotationEditActions';
import type { NoteEditActions } from '../reader/useAnnotations';

interface LibraryAnnotationsState {
  /** The live annotations of every library book; empty until loaded. */
  annotations: Annotation[];
  loading: boolean;
  /** A user-facing message when the annotations could not be loaded; null otherwise. */
  error: string | null;
  /** Stores edits to and deletions of one annotation and applies them to `annotations` at once. */
  editActions: NoteEditActions;
}

const LOAD_FAILED_MESSAGE = 'Your notes could not be loaded.';

/**
 * Loads the annotations of every library book each time the Notes view opens,
 * and keeps them current as the reader edits or deletes Notes there.
 */
export function useLibraryAnnotations(): LibraryAnnotationsState {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editActions = useAnnotationEditActions(setAnnotations);

  useEffect(() => {
    let cancelled = false;
    const fail = (detail: unknown): void => {
      console.error('Could not load the Notes view:', detail);
      if (!cancelled) setError(LOAD_FAILED_MESSAGE);
    };
    window.api
      .listLibraryAnnotations()
      .then((result) => {
        if (cancelled) return;
        if (isOk(result)) setAnnotations(result.data);
        else fail(result.error);
      })
      .catch(fail)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { annotations, loading, error, editActions };
}
