/** Narrowest the reader sidebar can be; also its default width. */
export const SIDEBAR_MIN_WIDTH = 240;

/** Widest the user can drag the reader sidebar. */
export const SIDEBAR_MAX_WIDTH = 480;

/** Pixels the sidebar grows or shrinks per arrow key press on its resize handle. */
export const SIDEBAR_KEYBOARD_STEP = 16;

/** Width the Notes sidebar opens at until the reader drags it; wider than the reader sidebar because notes are prose. */
export const NOTES_SIDEBAR_DEFAULT_WIDTH = 320;

/**
 * Space the Notes sidebar takes beside its own width: its 8px margin from the
 * window edge plus an 8px gap so the narrowed page does not touch the panel.
 */
const NOTES_SIDEBAR_PAGE_GAP = 16;

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

/**
 * How far in from the window's right edge the page area must end so the Notes
 * sidebar pushes the page instead of covering it.
 *
 * @param open - Whether the Notes sidebar is showing.
 * @param sidebarWidth - The sidebar's width in pixels.
 * @returns Pixels to reserve on the right; 0 while the sidebar is closed.
 */
export function getNotesPageInset(open: boolean, sidebarWidth: number): number {
  return open ? sidebarWidth + NOTES_SIDEBAR_PAGE_GAP : 0;
}
