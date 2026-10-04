import { useEffect, useState } from 'react';
import { isOk } from '@taking-book/core';

interface DownloadOverMobileDataState {
  /** Whether PDFs may download over mobile data, or null while it is still loading. */
  allowed: boolean | null;
  /** A message fit to show the reader when loading or saving failed. */
  error: string | null;
  choose: (allowed: boolean) => void;
}

/**
 * The device-local "Download PDFs over mobile data" choice. Choosing shows at
 * once and saves; a failed save puts the earlier choice back.
 */
export function useDownloadOverMobileData(): DownloadOverMobileDataState {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.getDownloadOverMobileData().then((res) => {
      if (cancelled) return;
      if (isOk(res)) setAllowed(res.data);
      else {
        console.error('Failed to load the mobile-data download setting', res.error);
        setError('Could not load this setting.');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = (next: boolean): void => {
    const previous = allowed;
    setAllowed(next);
    setError(null);
    window.api.setDownloadOverMobileData(next).then((res) => {
      if (isOk(res)) return;
      console.error('Failed to save the mobile-data download setting', res.error);
      setAllowed(previous);
      setError('Could not save this setting. Please try again.');
    });
  };

  return { allowed, error, choose };
}
