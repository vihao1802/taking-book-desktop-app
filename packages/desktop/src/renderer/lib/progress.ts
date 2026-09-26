import { progressFraction } from '@taking-book/core';
import type { BookFile } from '../../shared/types';

/**
 * Whole-document reading progress as a fraction (0..1), or null if never read.
 * Both views save the real PDF page they were on plus how far down it, so one
 * formula covers page and reflow positions.
 */
export function readingProgressFraction(file: BookFile): number | null {
  if (file.lastPage == null || file.pageCount == null) return null;
  return progressFraction(
    { page: file.lastPage, position: file.lastPosition ?? 0, mode: file.lastMode },
    file.pageCount,
  );
}

/** Progress as an integer percent for Progress bars; null if never read. */
export function readingProgressPercent(file: BookFile): number | null {
  const fraction = readingProgressFraction(file);
  return fraction == null ? null : Math.round(fraction * 100);
}

/**
 * Where the reader is in a Book ("Page 45 of 320 · 14%"), or just "Page 45"
 * while the page count is unknown; null if the Book was never read.
 */
export function progressLine(file: BookFile): string | null {
  if (file.lastPage == null) return null;
  const percent = readingProgressPercent(file);
  if (file.pageCount == null || percent == null) return `Page ${file.lastPage}`;
  return `Page ${file.lastPage} of ${file.pageCount} · ${percent}%`;
}
