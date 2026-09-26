import { useCallback, useEffect, useRef, useState } from 'react';
import { TRANSLATION_FAILED_MESSAGE } from '@taking-book/core';
import type { Result, Translation } from '../../shared/types';
import type { SelectionAnchor } from './floating-placement';

/** What the Translation popup shows: `result` is null while the request is in flight. */
export interface TranslationPopupState {
  anchor: SelectionAnchor;
  result: Result<Translation> | null;
}

interface TranslationPopupControls {
  popup: TranslationPopupState | null;
  translate: (text: string, anchor: SelectionAnchor) => void;
  close: () => void;
}

/**
 * State of the Translation popup for one Selection toolbar. Each request and
 * each close bumps a generation, so a result that arrives after the popup was
 * closed or replaced by a newer request is dropped instead of shown.
 */
export function useTranslationPopup(): TranslationPopupControls {
  const [popup, setPopup] = useState<TranslationPopupState | null>(null);
  const generationRef = useRef(0);

  // A reader that closes before the answer arrives must not get a state update after unmount.
  useEffect(() => () => void (generationRef.current += 1), []);

  const translate = useCallback((text: string, anchor: SelectionAnchor) => {
    const generation = ++generationRef.current;
    setPopup({ anchor, result: null });
    void requestTranslation(text).then((result) => {
      if (generation === generationRef.current) setPopup({ anchor, result });
    });
  }, []);

  const close = useCallback(() => {
    generationRef.current += 1;
    setPopup(null);
  }, []);

  return { popup, translate, close };
}

// The preload bridge resolves with a Result, but IPC itself can still reject
// (for example while the window is being torn down).
async function requestTranslation(text: string): Promise<Result<Translation>> {
  try {
    return await window.api.translate(text);
  } catch (error) {
    console.error('translate: IPC call failed', error);
    return { ok: false, error: TRANSLATION_FAILED_MESSAGE };
  }
}
