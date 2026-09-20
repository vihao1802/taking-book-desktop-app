/** A position in a document expressed as a page plus how far down that page it is. */
export interface PageLocation {
  /** 1-based page number. */
  page: number;
  /** Fraction (0..1) of the way down the page's span. */
  fraction: number;
}

/**
 * Finds which page a vertical offset falls on.
 *
 * @param offsets - Top offset of each page, ascending; `offsets[i]` is page `i + 1`.
 * @param y - Vertical offset to look up.
 * @returns The 0-based index of the last page whose top is at or above `y`
 * (0 for offsets above the first page, or when there are no pages).
 */
export function pageIndexAtOffset(offsets: number[], y: number): number {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (offsets[mid] <= y) low = mid;
    else high = mid - 1;
  }
  return Math.max(low, 0);
}

/**
 * A page counts as current once its top is within this many px of the viewport
 * top. Page tops are fractional layout positions while browsers round `scrollTop`
 * to a whole physical pixel, so a page scrolled to exactly can read as up to a
 * pixel short of its own top, and would otherwise be taken for the previous one.
 */
export const PAGE_PROBE_PX = 2;

/**
 * Finds which page is at the top of a scroll container, allowing for the
 * rounding of `scrollTop` (see `PAGE_PROBE_PX`).
 *
 * @param offsets - Top offset of each page, ascending; `offsets[i]` is page `i + 1`.
 * @param scrollTop - The container's scroll offset.
 * @returns The 0-based index of the page under the top of the viewport.
 */
export function pageIndexAtScroll(offsets: number[], scrollTop: number): number {
  return pageIndexAtOffset(offsets, scrollTop + PAGE_PROBE_PX);
}

function pageSpan(offsets: number[], totalHeight: number, pageIndex: number): { top: number; height: number } {
  const top = offsets[pageIndex];
  const bottom = pageIndex + 1 < offsets.length ? offsets[pageIndex + 1] : totalHeight;
  return { top, height: Math.max(bottom - top, 0) };
}

/**
 * Converts a vertical offset into a page and the fraction of that page above it.
 * Both reading modes describe where the reader is this way, so a position can
 * move between page view and reflow even though their layouts share no heights.
 *
 * @param offsets - Top offset of each page, ascending.
 * @param totalHeight - Full height of the scrollable content (the last page's bottom).
 * @param y - Vertical offset to convert.
 * @returns The page and the fraction within it, clamped to 0..1 (0 for a zero-height page).
 */
export function pageLocationAtOffset(offsets: number[], totalHeight: number, y: number): PageLocation {
  if (offsets.length === 0) return { page: 1, fraction: 0 };
  const pageIndex = pageIndexAtOffset(offsets, y);
  const { top, height } = pageSpan(offsets, totalHeight, pageIndex);
  const fraction = height > 0 ? Math.min(Math.max((y - top) / height, 0), 1) : 0;
  return { page: pageIndex + 1, fraction };
}

/**
 * Inverse of `pageLocationAtOffset`: the vertical offset of a page location.
 * Pages outside the document are clamped to the first or last page.
 *
 * @param offsets - Top offset of each page, ascending.
 * @param totalHeight - Full height of the scrollable content.
 * @param location - The page and fraction to convert.
 * @returns The vertical offset, or 0 when there are no pages.
 */
export function offsetForPageLocation(offsets: number[], totalHeight: number, location: PageLocation): number {
  if (offsets.length === 0) return 0;
  const pageIndex = Math.min(Math.max(Math.round(location.page) - 1, 0), offsets.length - 1);
  const { top, height } = pageSpan(offsets, totalHeight, pageIndex);
  return top + Math.min(Math.max(location.fraction, 0), 1) * height;
}
