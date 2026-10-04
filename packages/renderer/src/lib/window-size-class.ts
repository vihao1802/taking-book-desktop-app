/** How much room the app window has, by its real width (CONTEXT.md: Window size class). */
export type WindowSizeClass = 'compact' | 'medium' | 'expanded';

/** First width, in dp (CSS pixels), of the medium class; narrower windows are compact. */
export const MEDIUM_MIN_WIDTH_DP = 600;
/** First width, in dp (CSS pixels), of the expanded class. */
export const EXPANDED_MIN_WIDTH_DP = 840;

/**
 * Classifies a window width.
 *
 * @param widthDp The window's width in dp, which is CSS pixels in the renderer.
 * @returns compact under 600, medium from 600 to 839, expanded from 840 up.
 */
export function classifyWindowWidth(widthDp: number): WindowSizeClass {
  if (widthDp < MEDIUM_MIN_WIDTH_DP) return 'compact';
  if (widthDp < EXPANDED_MIN_WIDTH_DP) return 'medium';
  return 'expanded';
}
