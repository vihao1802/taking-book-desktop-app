import {
  checkForUpdate,
  err,
  isReleaseDownloadUrl,
  LATEST_RELEASE_API_URL,
  ok,
  RELEASES_PAGE_URL,
  type Result,
} from '@taking-book/core';
import type { ReaderApi } from '@taking-book/renderer';

// A launch-time check must never hang; the reader can live without the notice.
const REQUEST_TIMEOUT_MS = 10_000;

/** The platform pieces the update check needs and core cannot supply itself. */
export interface AppUpdatesOptions {
  getAppVersion: () => Promise<string>;
  /** Fetches the latest release's JSON. Must resolve, never reject. */
  fetchLatestRelease: () => Promise<Result<unknown>>;
  /** Opens a link in the system browser. */
  openUrl: (url: string) => Promise<Result<void>>;
  log: (message: string) => void;
}

export type AppUpdates = Pick<ReaderApi, 'checkForUpdate' | 'openUpdateDownload' | 'openReleasesPage' | 'getAppVersion'>;

/**
 * The Android side of the update notice: checks the latest release for the APK
 * and opens its download in the browser. There is no in-app installer (ADR-0008).
 *
 * @param options The version, network and browser sources.
 * @returns The update-related parts of the reader API.
 */
export function createAppUpdates(options: AppUpdatesOptions): AppUpdates {
  return {
    checkForUpdate: async () => {
      const version = await readVersion(options);
      if (!version.ok) return version;
      const result = await checkForUpdate({
        currentVersion: version.data,
        platform: 'android',
        arch: '',
        fetchLatestRelease: options.fetchLatestRelease,
      });
      if (!result.ok) options.log(`update: could not check ${LATEST_RELEASE_API_URL}: ${result.error}`);
      return result;
    },
    openUpdateDownload: async (url) => {
      if (!isReleaseDownloadUrl(url)) return err('Only this app’s release downloads can be opened.');
      return options.openUrl(url);
    },
    openReleasesPage: () => options.openUrl(RELEASES_PAGE_URL),
    getAppVersion: () => readVersion(options),
  };
}

// The plugin call can reject; the renderer expects a Result, so the failure is logged and returned.
async function readVersion(options: AppUpdatesOptions): Promise<Result<string>> {
  try {
    return ok(await options.getAppVersion());
  } catch (error) {
    options.log(`update: could not read the app version: ${String(error)}`);
    return err('Could not read the app version.');
  }
}

/**
 * Fetches GitHub's latest release JSON, giving up after a short timeout.
 *
 * @returns The parsed JSON, or an error message when the request failed.
 */
export async function fetchLatestRelease(): Promise<Result<unknown>> {
  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return err(`GitHub answered ${response.status}`);
    return ok(await response.json());
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
