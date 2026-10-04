import type { WindowSizeClass } from '@/lib/window-size-class';

/** Widest a Page mode page gets in the expanded class, so lines stay comfortable to read on a large screen. */
export const MAX_PAGE_WIDTH_DP = 900;

/**
 * The width a Page mode page has at 100% zoom (fit-to-width).
 *
 * @param contentWidth - The usable reading width in dp, without the scrollbar.
 * @param sizeClass - The Window size class; only expanded caps the width.
 * @returns The width in dp that zoom is applied to.
 */
export function getPageBaseWidth(contentWidth: number, sizeClass: WindowSizeClass): number {
  return sizeClass === 'expanded' ? Math.min(contentWidth, MAX_PAGE_WIDTH_DP) : contentWidth;
}
