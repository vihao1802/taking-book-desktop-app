import { useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { Annotation } from '../../shared/types';

interface LibraryAnnotationsState {
  /** The live annotations of every library book; empty until loaded. */
  annotations: Annotation[];
  loading: boolean;
  /** A user-facing message when the annotations could not be loaded; null otherwise. */
  error: string | null;
}

const LOAD_FAILED_MESSAGE = 'Your notes could not be loaded.';

function loadFailed(detail: unknown): LibraryAnnotationsState {
  console.error('Could not load the Notes view:', detail);
  return { annotations: [], loading: false, error: LOAD_FAILED_MESSAGE };
}

/** Loads the annotations of every library book each time the Notes view opens. */
export function useLibraryAnnotations(): LibraryAnnotationsState {
  const [state, setState] = useState<LibraryAnnotationsState>({ annotations: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    window.api
      .listLibraryAnnotations()
      .then((result) => (isOk(result) ? { annotations: result.data, loading: false, error: null } : loadFailed(result.error)))
      .catch(loadFailed)
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
