import type { Result } from '../result';
import { err, ok } from '../result';
import { getSetting, setSetting } from '../settingsRepository';
import type { SqlDriver } from '../sql';
import { MAX_DOWNLOAD_BYTES, type DownloadSkipReason, type SkippedDownload } from './blobTransfer';
import type { SyncStorage } from './types';

/**
 * Remote-only Books (CONTEXT.md): Books in the Library whose PDF is not on this
 * device. The reason is remembered per device after each sync so Book details
 * can say why, and offer a one-off download when the reason is not the size.
 */

const SKIPPED_DOWNLOADS_KEY = 'sync.skippedDownloads';

/** Why a Book is remote-only; `pending` means no sync has said yet. */
export type RemoteOnlyReason = DownloadSkipReason | 'pending';

/** A Book whose PDF is not on this device, with the reason worded for the reader. */
export interface RemoteOnlyBook {
  hash: string;
  reason: RemoteOnlyReason;
  message: string;
  /** Whether a one-off "Download now" can fix it; false for a PDF too large for this device. */
  canDownloadNow: boolean;
}

const PENDING_MESSAGE = 'This PDF has not been downloaded to this device yet. It downloads on the next sync.';

function isSkippedDownload(value: unknown): value is SkippedDownload {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.hash === 'string' &&
    typeof item.title === 'string' &&
    typeof item.message === 'string' &&
    (item.reason === 'network' || item.reason === 'storage' || item.reason === 'size')
  );
}

/**
 * Remembers which PDFs the latest sync did not download. This replaces the
 * earlier list: a sync looks at every Book, so its list is complete.
 */
export async function saveSkippedDownloads(db: SqlDriver, skipped: SkippedDownload[]): Promise<Result<void>> {
  return setSetting(db, SKIPPED_DOWNLOADS_KEY, JSON.stringify(skipped));
}

/** Reads the PDFs the latest sync did not download; empty when there is none or the saved value is unreadable. */
export async function getSkippedDownloads(db: SqlDriver): Promise<Result<SkippedDownload[]>> {
  const stored = await getSetting(db, SKIPPED_DOWNLOADS_KEY);
  if (!stored.ok) return stored;
  if (!stored.data) return ok([]);
  try {
    const parsed: unknown = JSON.parse(stored.data);
    return ok(Array.isArray(parsed) ? parsed.filter(isSkippedDownload) : []);
  } catch {
    return ok([]);
  }
}

/**
 * Describes one Book that is missing from the device.
 *
 * @param hash The Book's content hash.
 * @param skipped What the latest sync recorded for it, if anything.
 * @returns The reason and whether a one-off download can fix it.
 */
export function describeRemoteOnlyBook(hash: string, skipped: SkippedDownload | undefined): RemoteOnlyBook {
  if (!skipped) return { hash, reason: 'pending', message: PENDING_MESSAGE, canDownloadNow: true };
  return { hash, reason: skipped.reason, message: skipped.message, canDownloadNow: skipped.reason !== 'size' };
}

export interface DownloadBookNowOptions {
  remote: SyncStorage;
  local: SyncStorage;
  hash: string;
}

/**
 * Downloads one Book's PDF once, ignoring the Wi-Fi and free-storage rules
 * because the reader asked for it. The size limit still applies, since the
 * whole file is held in memory.
 *
 * @returns Ok when the PDF is now on the device, otherwise an error worded for the reader.
 */
export async function downloadBookNow(options: DownloadBookNowOptions): Promise<Result<void>> {
  const key = `blobs/${options.hash}`;
  const stat = await options.remote.statFile(key);
  if (!stat.ok) return stat;
  if (!stat.data) return err('This PDF is not in your Google Drive folder yet. Open it on the device that has it and sync there first.');
  if (stat.data.size > MAX_DOWNLOAD_BYTES) return err('This PDF is too large for this device. Read it on desktop.');
  const bytes = await options.remote.readFile(key);
  if (!bytes.ok) return bytes;
  if (!bytes.data) return err('The PDF could not be downloaded. Try again.');
  return options.local.writeFile(key, bytes.data);
}
