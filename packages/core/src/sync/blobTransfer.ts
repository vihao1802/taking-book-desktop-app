/**
 * Rules for moving Book files (PDFs) during a sync (ADR-0010). The manifest
 * always syncs; whether a PDF is downloaded depends on the device, so the
 * platform supplies a {@link BlobTransferPolicy} and core only asks it.
 */

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** A PDF above this size is never downloaded to a phone: the sync interface reads whole files into memory. */
export const MAX_DOWNLOAD_BYTES = 150 * BYTES_PER_MEGABYTE;

/** Downloading stops when free storage is under this. */
export const MIN_FREE_STORAGE_BYTES = 500 * BYTES_PER_MEGABYTE;

/** Why a PDF was not downloaded: the connection, the storage left, or the PDF's own size. */
export type DownloadSkipReason = 'network' | 'storage' | 'size';

/** A Book whose PDF a sync chose not to download, with the reason worded for the reader. */
export interface SkippedDownload {
  hash: string;
  title: string;
  reason: DownloadSkipReason;
  message: string;
}

/** The Book a sync is about to download. */
export interface DownloadRequest {
  hash: string;
  title: string;
  sizeBytes: number;
}

export type DownloadDecision = { download: true } | { download: false; reason: DownloadSkipReason; message: string };

/** What a platform decides about moving PDFs during a sync. */
export interface BlobTransferPolicy {
  /** Whether PDFs on this device are copied up to the cloud. */
  uploadBooks: boolean;
  /** Asked before every download; a skip is reported and never fails the sync. */
  decideDownload(request: DownloadRequest): Promise<DownloadDecision>;
}

/** The device's state at the moment of a download. */
export interface DeviceConditions {
  onWifi: boolean;
  /** The device-local "Download PDFs over mobile data" setting. */
  allowMobileData: boolean;
  /** Free storage in bytes; null when the platform cannot tell. */
  freeBytes: number | null;
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MEGABYTE)} MB`;
}

/**
 * Decides whether one PDF may be downloaded now. Size comes first because it
 * never changes, then storage, then the connection.
 *
 * @param sizeBytes The PDF's size in the cloud.
 * @param conditions The device's connection, setting and free storage.
 * @returns Download, or the reason not to with a message fit to show the reader.
 */
export function decidePdfDownload(sizeBytes: number, conditions: DeviceConditions): DownloadDecision {
  if (sizeBytes > MAX_DOWNLOAD_BYTES) {
    return {
      download: false,
      reason: 'size',
      message: `This PDF is ${formatMegabytes(sizeBytes)}, over the ${formatMegabytes(MAX_DOWNLOAD_BYTES)} limit for this device. Read it on desktop.`,
    };
  }
  if (conditions.freeBytes !== null && conditions.freeBytes < MIN_FREE_STORAGE_BYTES) {
    return {
      download: false,
      reason: 'storage',
      message: `Downloads stopped: less than ${formatMegabytes(MIN_FREE_STORAGE_BYTES)} of storage is free on this device.`,
    };
  }
  if (!conditions.onWifi && !conditions.allowMobileData) {
    return {
      download: false,
      reason: 'network',
      message: 'PDFs download on Wi-Fi. Connect to Wi-Fi, or allow mobile data in Settings.',
    };
  }
  return { download: true };
}
