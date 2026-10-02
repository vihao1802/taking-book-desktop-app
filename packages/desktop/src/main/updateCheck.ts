import { app, ipcMain, net, shell } from 'electron';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { checkForUpdate, err, ok, type AvailableUpdate, type ReleaseAsset, type Result } from '@taking-book/core';

const execFileAsync = promisify(execFile);

const REPOSITORY = 'vihao1802/taking-book-desktop-app';
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const RELEASES_PAGE_URL = `https://github.com/${REPOSITORY}/releases`;
const RELEASES_URL_PREFIX = `${RELEASES_PAGE_URL}/`;

// A launch-time check must never hang; the reader can live without the notice.
const REQUEST_TIMEOUT_MS = 10_000;
// Installers can run tens of MB; give the download real room before giving up.
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

/**
 * IPC for the Update notice and Settings' About & updates: reports the running
 * version, checks GitHub for a newer release, and downloads+opens its installer
 * (or the Releases page, when the release has none for this device) (ADR-0008).
 * Checking is read-only and anonymous, and a failure only means no update is offered.
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

  ipcMain.handle('update:download', async (_event, update: unknown): Promise<Result<void>> => {
    const action = selectDownloadAction(update);
    switch (action.kind) {
      case 'rejected':
        return err(action.reason);
      case 'open-browser':
        return openInBrowser(action.url);
      case 'download-asset':
        return downloadAndInstall(action.asset);
    }
  });

  ipcMain.handle('update:releases', (): Promise<Result<void>> => openInBrowser(RELEASES_PAGE_URL));
}

/** What clicking Download should do, decided from the IPC payload alone (no I/O). */
export type DownloadAction =
  | { kind: 'rejected'; reason: string }
  | { kind: 'open-browser'; url: string }
  | { kind: 'download-asset'; asset: ReleaseAsset };

/**
 * Validates the renderer's `AvailableUpdate` and picks the branch: there is no
 * installer for this device (open the release page), or there is (download and
 * hand it to the OS). Rejects anything that is not one of this app's own
 * GitHub release links, so a compromised renderer cannot fetch or open arbitrary URLs.
 */
export function selectDownloadAction(update: unknown): DownloadAction {
  if (!isAvailableUpdate(update)) return { kind: 'rejected', reason: 'Not a valid update.' };
  if (!update.asset) {
    if (!isReleaseDownloadUrl(update.pageUrl)) return { kind: 'rejected', reason: 'Only this app’s release page can be opened.' };
    return { kind: 'open-browser', url: update.pageUrl };
  }
  if (!isReleaseDownloadUrl(update.asset.downloadUrl)) {
    return { kind: 'rejected', reason: 'Only this app’s release downloads can be opened.' };
  }
  return { kind: 'download-asset', asset: update.asset };
}

/**
 * Downloads the installer asset into a scratch directory, hands it to the OS
 * (the system installer on Windows/Linux, Finder on macOS since the asset is
 * a plain .zip of the app bundle), then quits so the installer can take over
 * (ADR-0008: this app is unsigned, so a silent in-place update is not an option).
 */
async function downloadAndInstall(asset: ReleaseAsset): Promise<Result<void>> {
  // `path.basename` strips any directory components a crafted asset.name could carry
  // (the renderer only ever echoes back what `update:check` gave it, but this is the
  // last line of defense before the name reaches the filesystem).
  const downloadDir = path.join(app.getPath('temp'), 'taking-book-update');
  const filePath = path.join(downloadDir, path.basename(asset.name));
  try {
    // Wiped on every attempt so a failed or superseded download never lingers.
    await rm(downloadDir, { recursive: true, force: true });
    await mkdir(downloadDir, { recursive: true });
    await downloadFile(asset.downloadUrl, filePath);
  } catch (error) {
    console.error(`update: could not download ${asset.downloadUrl}: ${String(error)}`);
    return err('Could not download the update. Check your internet connection and try again.');
  }

  const opened = await openDownloadedInstaller(filePath);
  if (!opened.ok) return opened;

  app.quit();
  return ok(undefined);
}

async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await net.fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`GitHub answered ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(filePath));
}

async function openDownloadedInstaller(filePath: string): Promise<Result<void>> {
  if (process.platform === 'darwin') return revealExtractedApp(filePath);
  return openWithSystemHandler(filePath);
}

// On Linux, `shell.openPath`'s promise can stay pending until the launched
// handler itself exits rather than resolving once it has launched (a known
// Electron/xdg-open quirk) — and a package-install GUI (GNOME Software,
// gdebi, …) may itself be waiting for this app to quit before it proceeds,
// which deadlocks the two. Race it against a short timeout: once the handler
// has had time to launch, treat a still-pending openPath as a launch that
// succeeded, so quitting is never blocked on an installer window closing.
const OPEN_INSTALLER_TIMEOUT_MS = 3_000;

export async function openWithSystemHandler(filePath: string): Promise<Result<void>> {
  const opened = shell.openPath(filePath).then((openError): Result<void> => (openError ? err(openError) : ok(undefined)));
  const launched = new Promise<Result<void>>((resolve) => setTimeout(() => resolve(ok(undefined)), OPEN_INSTALLER_TIMEOUT_MS));
  const result = await Promise.race([opened, launched]);
  if (!result.ok) {
    console.error(`update: could not open ${filePath}: ${result.error}`);
    return err('Could not open the downloaded installer.');
  }
  return result;
}

/**
 * macOS ships a plain .zip of the app bundle, not an installer, so there is
 * nothing to "run" (ADR-0008). Unzipping it and revealing the result in
 * Finder is as close to installing as an unsigned .zip gets.
 */
async function revealExtractedApp(zipPath: string): Promise<Result<void>> {
  const extractDir = path.join(path.dirname(zipPath), 'extracted');
  try {
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    await execFileAsync('unzip', ['-o', zipPath, '-d', extractDir]);
  } catch (error) {
    console.error(`update: could not unzip ${zipPath}: ${String(error)}`);
    const missingUnzip = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    return err(missingUnzip ? 'This Mac has no unzip tool installed.' : 'Could not open the downloaded update.');
  }

  const appBundle = await findAppBundle(extractDir);
  if (!appBundle) {
    console.error(`update: no .app found after unzipping ${zipPath}`);
    return err('Could not open the downloaded update.');
  }

  shell.showItemInFolder(appBundle);
  return ok(undefined);
}

/** The first top-level `.app` bundle in a directory, or null when there is none. */
export async function findAppBundle(dir: string): Promise<string | null> {
  const entries = await readdir(dir);
  const name = entries.find((entry) => entry.endsWith('.app'));
  return name ? path.join(dir, name) : null;
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

/**
 * True only for links into this app's GitHub releases, so a compromised
 * renderer cannot use the download action to open or fetch arbitrary URLs.
 */
export function isReleaseDownloadUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith(RELEASES_URL_PREFIX) && !url.includes('..');
}

/** Narrows the structured-cloned IPC argument back to an `AvailableUpdate`. */
export function isAvailableUpdate(value: unknown): value is AvailableUpdate {
  if (!isRecord(value)) return false;
  const { version, pageUrl, asset } = value;
  if (typeof version !== 'string' || typeof pageUrl !== 'string') return false;
  return asset === null || isReleaseAsset(asset);
}

function isReleaseAsset(value: unknown): value is ReleaseAsset {
  return isRecord(value) && typeof value.name === 'string' && typeof value.downloadUrl === 'string';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
