/** Shared data model for files in the library. */
export type Theme = 'light' | 'dark' | 'sepia' | 'system';

/** Reader status of a book. */
export type BookStatus = 'unread' | 'reading' | 'finished';

/** A document registered in the library, keyed by content hash. */
export interface BookFile {
  id: number;
  hash: string;
  path: string;
  title: string;
  status: BookStatus;
  tags: string[];
  lastPage: number | null;
  lastPosition: number | null;
  createdAt: string;
}

/** Where the reader should resume for a book. */
export interface LastPosition {
  page: number;
  position: number;
}

/** Payload returned when the user opens a file. */
export interface OpenFileResult {
  file: BookFile;
}
