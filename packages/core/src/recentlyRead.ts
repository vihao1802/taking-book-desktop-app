import type { BookFile } from './models';

/**
 * Orders books by how recently they were read, most recent first. Books that
 * were never read (`lastReadAt` null) sink to the end and keep their incoming
 * order, so the library's newest-first ordering still breaks ties for them.
 * Returns a new array; the input is not mutated.
 */
export function sortByRecentlyRead(files: BookFile[]): BookFile[] {
  return [...files].sort((a, b) => (b.lastReadAt ?? -Infinity) - (a.lastReadAt ?? -Infinity) || 0);
}
