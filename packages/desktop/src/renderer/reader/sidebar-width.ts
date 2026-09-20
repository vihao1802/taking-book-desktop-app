/** Narrowest the reader sidebar can be; also its default width. */
export const SIDEBAR_MIN_WIDTH = 240;

/** Widest the user can drag the reader sidebar. */
export const SIDEBAR_MAX_WIDTH = 480;

/** Pixels the sidebar grows or shrinks per arrow key press on its resize handle. */
export const SIDEBAR_KEYBOARD_STEP = 16;

/** Thumbnail width at the minimum sidebar width; it grows one-to-one with the sidebar. */
const THUMBNAIL_MIN_WIDTH = 148;

/** Keeps a sidebar width within the allowed range, rounded to whole pixels. */
export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)));
}

/** CSS width of each page thumbnail for a given sidebar width. */
export function getThumbnailWidth(sidebarWidth: number): number {
  return THUMBNAIL_MIN_WIDTH + (sidebarWidth - SIDEBAR_MIN_WIDTH);
}
