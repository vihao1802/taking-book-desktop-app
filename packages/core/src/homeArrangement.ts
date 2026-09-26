import type { BookFile } from './models';
import { sortByRecentlyRead } from './recentlyRead';

/** How many Books the Recently added shelf shows at most. */
export const RECENTLY_ADDED_LIMIT = 4;

/**
 * The single Book Home puts forward: one being read is offered as `continue`,
 * one not yet started as `start`.
 */
export interface FeaturedBook {
  book: BookFile;
  kind: 'continue' | 'start';
}

/** What Home shows, in order, with no Book appearing twice. */
export interface HomeArrangement {
  featured: FeaturedBook | null;
  /** The other Books being read, most recently read first. */
  readingNow: BookFile[];
  /** The newest Books not already shown above, at most RECENTLY_ADDED_LIMIT. */
  recentlyAdded: BookFile[];
}

/**
 * Whether a Book counts as being read. Opening a Book never changes its
 * status, so a "To read" Book that has been opened (it has a last-read time)
 * is being read too; a finished Book never is.
 */
export function isBeingRead(file: BookFile): boolean {
  if (file.status === 'reading') return true;
  return file.status === 'unread' && file.lastReadAt != null;
}

/**
 * Arranges the library for Home: the Featured book (the most recently read
 * Book being read, else the newest unstarted "To read" Book, else none), the
 * Reading now shelf and the Recently added shelf.
 *
 * @param files the library's live Books, in any order
 * @returns the arrangement; each Book appears in at most one place
 */
export function arrangeHome(files: BookFile[]): HomeArrangement {
  const newestFirst = sortByRecentlyAdded(files);
  const [current, ...otherReading] = sortByRecentlyRead(newestFirst.filter(isBeingRead));
  const featured = current
    ? { book: current, kind: 'continue' as const }
    : pickStartBook(newestFirst);

  const shown = new Set<number>(otherReading.map((f) => f.id));
  if (featured) shown.add(featured.book.id);
  const recentlyAdded = newestFirst.filter((f) => !shown.has(f.id)).slice(0, RECENTLY_ADDED_LIMIT);

  return { featured, readingNow: otherReading, recentlyAdded };
}

function pickStartBook(newestFirst: BookFile[]): FeaturedBook | null {
  const unstarted = newestFirst.find((f) => f.status === 'unread' && f.lastReadAt == null);
  return unstarted ? { book: unstarted, kind: 'start' } : null;
}

// `createdAt` is SQLite's 'YYYY-MM-DD HH:MM:SS', so string order is time order;
// the id breaks ties between Books added in the same second, as the repository does.
function sortByRecentlyAdded(files: BookFile[]): BookFile[] {
  return [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}
