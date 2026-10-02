import { useCallback, useEffect, useState } from 'react';
import type { AvailableUpdate } from '@taking-book/core';

export interface UpdateCheck {
  /** The newer release to offer; null while checking, when up to date, offline, or once dismissed. */
  update: AvailableUpdate | null;
  /** Why the download could not be opened, shown in the notice; null otherwise. */
  downloadError: string | null;
  /** Opens this device's installer in the browser, then hides the notice. */
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
    setDownloadError(null);
  }, []);

  const download = useCallback(async (): Promise<void> => {
    if (!update) return;
    const res = await window.api.openUpdateDownload(update.downloadUrl);
    if (res.ok) dismiss();
    else setDownloadError(res.error);
  }, [update, dismiss]);

  return { update, downloadError, download, dismiss };
}
