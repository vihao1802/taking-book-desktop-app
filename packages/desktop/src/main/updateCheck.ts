import { app, ipcMain, net, shell } from 'electron';
import {
  checkForUpdate,
  err,
  isReleaseDownloadUrl,
  LATEST_RELEASE_API_URL,
  ok,
  RELEASES_PAGE_URL,
  type AvailableUpdate,
  type Result,
} from '@taking-book/core';

export { isReleaseDownloadUrl };

// A launch-time check must never hang; the reader can live without the notice.
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * IPC for the Update notice and Settings' About & updates: reports the running
 * version, checks GitHub for a newer release, and opens its installer or the
 * Releases page in the browser. Checking is read-only and anonymous, and a
 * failure only means no update is offered.
 */
export function registerUpdateIpc(): void {
  ipcMain.handle('app:version', (): Result<string> => ok(app.getVersion()));

  ipcMain.handle('update:check', async (): Promise<Result<AvailableUpdate | null>> => {
    const result = await checkForUpdate({
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      fetchLatestRelease,
    });
    if (!result.ok) console.warn(`update: could not check ${LATEST_RELEASE_API_URL}: ${result.error}`);
    return result;
  });

  ipcMain.handle('update:download', async (_event, url: unknown): Promise<Result<void>> => {
    if (!isReleaseDownloadUrl(url)) return err('Only this app’s release downloads can be opened.');
    return openInBrowser(url);
  });

  ipcMain.handle('update:releases', (): Promise<Result<void>> => openInBrowser(RELEASES_PAGE_URL));
}

async function openInBrowser(url: string): Promise<Result<void>> {
  try {
    await shell.openExternal(url);
    return ok(undefined);
  } catch (error) {
    console.error(`update: could not open ${url}: ${String(error)}`);
    return err('Could not open the link in your browser.');
  }
}

async function fetchLatestRelease(): Promise<Result<unknown>> {
  try {
    const response = await net.fetch(LATEST_RELEASE_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return err(`GitHub answered ${response.status}`);
    return ok(await response.json());
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
