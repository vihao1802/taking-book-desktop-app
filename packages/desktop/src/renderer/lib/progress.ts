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

/** Human-readable resume hint ("Page N"), or null if the book was never read. */
export function positionLabel(file: BookFile): string | null {
  return file.lastPage == null ? null : `Page ${file.lastPage}`;
}
