import { useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';

interface TargetLanguageState {
  /** The Target language in effect, or null while it is still loading. */
  language: string | null;
  /** A message fit to show the reader when loading or saving failed. */
  error: string | null;
  chooseLanguage: (code: string) => void;
}

/**
 * The Target language shown and chosen in Settings. Choosing one shows it at
 * once and saves it; a failed save puts the earlier language back.
 */
export function useTargetLanguage(): TargetLanguageState {
  const [language, setLanguage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.getTargetLanguage().then((res) => {
      if (cancelled) return;
      if (!isOk(res)) {
        console.error('Failed to load Target language', res.error);
        setError('Could not load your Target language.');
        return;
      }
      setLanguage(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const chooseLanguage = (code: string): void => {
    const previous = language;
    setLanguage(code);
    setError(null);
    window.api.setTargetLanguage(code).then((res) => {
      if (isOk(res)) return;
      console.error(`Failed to save Target language "${code}"`, res.error);
      setLanguage(previous);
      setError('Could not save your Target language. Please try again.');
    });
  };

  return { language, error, chooseLanguage };
}
