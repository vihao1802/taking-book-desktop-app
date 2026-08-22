import { progressFraction } from '@taking-book/core';
import type { BookFile } from '../../shared/types';

/**
 * Whole-document reading progress as a fraction (0..1), or null if never read.
 * Page-mode positions are {pdfPage, fraction-within-page}; reflow positions are
 * already a whole-document scroll fraction, so they map straight across.
 */
export function readingProgressFraction(file: BookFile): number | null {
  if (file.lastPage == null) return null;
  if (file.lastMode === 'reflow') {
    const raw = file.lastPosition ?? 0;
    return Math.min(1, Math.max(0, raw));
  }
  if (file.pageCount == null) return null;
  return progressFraction(
    { page: file.lastPage, position: file.lastPosition ?? 0, mode: 'page' },
    file.pageCount,
  );
}

/** Progress as an integer percent for Progress bars; null if never read. */
export function readingProgressPercent(file: BookFile): number | null {
  const fraction = readingProgressFraction(file);
  return fraction == null ? null : Math.round(fraction * 100);
}

/**
 * Human-readable resume hint: "Page N" for page-mode books, a percent for
 * reflow-mode books whose saved position has no meaningful PDF page.
 */
export function positionLabel(file: BookFile): string | null {
  if (file.lastPage == null) return null;
  if (file.lastMode !== 'reflow') return `Page ${file.lastPage}`;
  const percent = readingProgressPercent(file);
  return percent == null ? null : `${percent}%`;
}
