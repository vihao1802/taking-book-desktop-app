import { useCallback, useEffect, useState } from 'react';
import type { UpdateStatus } from './update-status';

export interface ManualUpdateCheck {
  /** The running version, or null until the main process answers. */
  currentVersion: string | null;
  status: UpdateStatus;
  /** Why a link could not be opened in the browser; null otherwise. */
  linkError: string | null;
  check: () => Promise<void>;
  /** Opens this device's installer for the available update. */
  download: () => Promise<void>;
  openAllReleases: () => Promise<void>;
}

/**
 * Settings' About & updates: shows the running version and checks for a newer
 * release only when the reader asks, so a dismissed Update notice is never the
 * only way to get an update.
 */
export function useManualUpdateCheck(): ManualUpdateCheck {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    void window.api.getAppVersion().then((res) => {
      if (res.ok) setCurrentVersion(res.data);
      else console.error('[settings] Could not read the app version', res.error);
    });
  }, []);

  const check = useCallback(async (): Promise<void> => {
    setStatus({ kind: 'checking' });
    setLinkError(null);
    const res = await window.api.checkForUpdate();
    if (!res.ok) setStatus({ kind: 'failed' });
    else setStatus(res.data ? { kind: 'available', update: res.data } : { kind: 'up-to-date' });
  }, []);

  const download = useCallback(async (): Promise<void> => {
    if (status.kind !== 'available') return;
    const res = await window.api.openUpdateDownload(status.update.downloadUrl);
    setLinkError(res.ok ? null : res.error);
  }, [status]);

  const openAllReleases = useCallback(async (): Promise<void> => {
    const res = await window.api.openReleasesPage();
    setLinkError(res.ok ? null : res.error);
  }, []);

  return { currentVersion, status, linkError, check, download, openAllReleases };
}
