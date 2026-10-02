import { useCallback, useEffect, useState } from 'react';
import type { AvailableUpdate } from '@taking-book/core';

export interface UpdateCheck {
  /** The newer release to offer; null while checking, when up to date, offline, or once dismissed. */
  update: AvailableUpdate | null;
  /** Whether the installer is downloading, between clicking Download and the app handing off to it. */
  downloading: boolean;
  /** Why the download could not be opened, shown in the notice; null otherwise. */
  downloadError: string | null;
  /** Downloads and opens this device's installer, then hides the notice. */
  download: () => Promise<void>;
  /** Hides the notice until the next launch. */
  dismiss: () => void;
}

/**
 * Checks once per launch whether a newer release exists. A failed check is
 * logged by the main process and simply shows no notice, since the app is
 * local-first and works fine on an older version.
 */
export function useUpdateCheck(): UpdateCheck {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.checkForUpdate().then((res) => {
      if (!cancelled && res.ok) setUpdate(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback((): void => {
    setUpdate(null);
    setDownloading(false);
    setDownloadError(null);
  }, []);

  const download = useCallback(async (): Promise<void> => {
    if (!update) return;
    // Only the asset path is an actual download; the page-open fallback is instant.
    if (update.asset) setDownloading(true);
    setDownloadError(null);
    const res = await window.api.openUpdateDownload(update);
    if (res.ok) dismiss();
    else {
      setDownloading(false);
      setDownloadError(res.error);
    }
  }, [update, dismiss]);

  return { update, downloading, downloadError, download, dismiss };
}
