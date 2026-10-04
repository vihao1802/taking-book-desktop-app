import type { AnnotationColor, BookStatus, ReadMode } from '../models';
import type { Result } from '../result';
import type { SkippedDownload } from './blobTransfer';

/**
 * Last-write-wins clock stamp for a record. `updatedAt` is epoch milliseconds;
 * `updatedBy` is the device id and breaks ties deterministically.
 */
export interface SyncStamp {
  updatedAt: number;
  updatedBy: string;
}

/**
 * An annotation as it travels inside a sync record. Carries the same LWW clock
 * as the file record so concurrent highlight edits on different devices can be
 * merged per annotation instead of clobbering each other.
 */
export interface SyncAnnotation extends SyncStamp {
  /**
   * The writer's local row id. Still written so older builds, which match by
   * it, keep validating the record; newer builds match by `uid` instead.
   */
  id: number;
  /** Globally stable identity; absent on records written by older builds. */
  uid?: string;
  page: number;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string;
  color: AnnotationColor;
  note: string | null;
  paraIndex: number | null;
  paraStart: number | null;
  paraEnd: number | null;
  deleted: boolean;
}

/**
 * A single library record as it appears in the sync manifest. Deleted records
 * are ordinary records with `deleted: true`, so a newer delete beats an older
 * edit and a newer edit resurrects a deleted book.
 */
export interface SyncRecord extends SyncStamp {
  hash: string;
  title: string;
  status: BookStatus;
  tags: string[];
  favorite: boolean;
  lastPage: number | null;
  lastPosition: number | null;
  /** Reader view the position was measured in; null on manifests written before modes existed. */
  lastMode: ReadMode | null;
  pageCount: number | null;
  /** The zoom multiplier the book was last read at; null until the user zooms. */
  zoom: number | null;
  /** The zoom multiplier reflow mode was last read at, independent of `zoom`; null until the user zooms it. */
  reflowZoom: number | null;
  /** Epoch ms of the last read; null until first opened or on older manifests. */
  lastReadAt: number | null;
  /** Highlights and notes attached to this book; empty when there are none. */
  annotations: SyncAnnotation[];
  deleted: boolean;
}

/** The on-disk sync manifest: a versioned list of records keyed by hash. */
export interface SyncManifest {
  version: 1;
  records: SyncRecord[];
}

/**
 * Platform-agnostic cloud-drive handle. The desktop implements it over a
 * local folder synced by Dropbox/Google Drive/Nextcloud; a future mobile
 * client would implement it over the same folder visible on its platform.
 * Keys: `manifest.json` and `blobs/<hash>`.
 */
export interface SyncStorage {
  readFile(key: string): Promise<Result<Uint8Array | null>>;
  /** The size in bytes of a file without reading it; null when the file is not there. */
  statFile(key: string): Promise<Result<{ size: number } | null>>;
  writeFile(key: string, data: Uint8Array): Promise<Result<void>>;
  deleteFile(key: string): Promise<Result<void>>;
  listFiles(prefix: string): Promise<Result<string[]>>;
}

/** What a sync pass did, so the UI can report it and tests can assert it. */
export interface SyncSummary {
  added: number;
  updated: number;
  deleted: number;
  uploaded: number;
  downloaded: number;
  warnings: string[];
  /** PDFs this pass chose not to download, each with its reason. */
  skippedDownloads: SkippedDownload[];
}
