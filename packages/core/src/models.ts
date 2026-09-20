/** Shared data model for files in the library. */
export type Theme = 'light' | 'dark' | 'sepia' | 'system';

/** Reader status of a book. */
export type BookStatus = 'unread' | 'reading' | 'finished';

/**
 * The reader view a book was last read in. Page positions and reflow scroll
 * fractions are measured differently, so the saved position is only
 * interpretable together with its mode.
 */
export type ReadMode = 'page' | 'reflow';

/** A document registered in the library, keyed by content hash. */
export interface BookFile {
  id: number;
  hash: string;
  path: string;
  title: string;
  status: BookStatus;
  tags: string[];
  favorite: boolean;
  lastPage: number | null;
  lastPosition: number | null;
  /** Reader view the saved position was measured in; 'page' for legacy rows. */
  lastMode: ReadMode;
  /** Total pages of the document, known once the reader opens it. */
  pageCount: number | null;
  /** The zoom multiplier the book was last read at; null until the user zooms. */
  zoom: number | null;
  /** The zoom multiplier reflow mode was last read at, independent of page mode's; null until the user zooms it. */
  reflowZoom: number | null;
  /** Epoch ms of the last time the reader saved a position; null until first opened. */
  lastReadAt: number | null;
  createdAt: string;
}

/** Reading minutes logged for one calendar day (local time, YYYY-MM-DD). */
export interface DayMinutes {
  day: string;
  minutes: number;
}

/** Reading minutes accumulated on one library book over the stats window. */
export interface BookMinutes {
  fileId: number;
  title: string;
  minutes: number;
}

/** Aggregated reading statistics shown on the Statistics screen. */
export interface ReadingStats {
  /** Reading minutes per day for the trailing window, oldest first. */
  series: DayMinutes[];
  /** Consecutive days read ending today (or yesterday if today is empty). */
  currentStreak: number;
  /** Longest run of consecutive reading days in the window. */
  longestStreak: number;
  /** Total reading minutes in the window. */
  totalMinutes: number;
  /** Reading minutes recorded today. */
  minutesToday: number;
  /** Reading minutes per library book over the window, most-read first. */
  books: BookMinutes[];
}

/**
 * Where the reader should resume for a book. `page` is always the real PDF
 * page. `position` is how far down the reader is: a scroll fraction of the whole
 * layout in page mode, and the fraction within `page` in reflow mode (reflow
 * text re-wraps, so only the page and the offset inside it mean the same place
 * after the layout changes).
 */
export interface LastPosition {
  page: number;
  position: number;
  /** The reader view this position was measured in. */
  mode: ReadMode;
}

/** Payload returned when the user opens one or more files. */
export interface OpenFileResult {
  files: BookFile[];
}

/** Highlight marker colors offered to the reader. */
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'pink';

/**
 * A highlight (and its optional comment) anchored to a stretch of text. Two
 * anchors are stored so the same highlight can render in both reader modes:
 * char offsets into the page's joined pdf.js text content (page view) and
 * offsets into a reflow paragraph (reflow view). One of the pair may be null
 * when the text could not be matched in that mode at creation time.
 */
export interface Annotation {
  id: number;
  fileHash: string;
  /** 1-based PDF page the highlighted text lives on. */
  page: number;
  /** Char range into the page's joined textContent, for the page view. */
  pageStart: number | null;
  pageEnd: number | null;
  /** The highlighted text, as it was selected. */
  quote: string;
  color: AnnotationColor;
  /** Comment attached to the highlight; null when there is none. */
  note: string | null;
  /** Char range into a reflow paragraph, for the reflow view. */
  paraIndex: number | null;
  paraStart: number | null;
  paraEnd: number | null;
  createdAt: string;
  updatedAt: number;
  updatedBy: string;
}

/** Payload for creating a new highlight/comment. */
export interface CreateAnnotationInput {
  page: number;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string;
  color: AnnotationColor;
  note: string | null;
  paraIndex: number | null;
  paraStart: number | null;
  paraEnd: number | null;
}
