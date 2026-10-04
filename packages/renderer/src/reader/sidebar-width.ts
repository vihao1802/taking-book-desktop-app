import type { WindowSizeClass } from '@/lib/window-size-class';

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
 * Whether the Notes sidebar is a bottom sheet over the page instead of a panel
 * that pushes it: only the expanded class has the room to narrow the page.
 */
export function isNotesSidebarSheet(sizeClass: WindowSizeClass): boolean {
  return sizeClass !== 'expanded';
}

/**
 * CSS max-width of the floating Reader sidebar: most of the screen on a phone,
 * so the page behind it stays visible, and just inside the window otherwise.
 */
export function getReaderSidebarMaxWidth(sizeClass: WindowSizeClass): string {
  return sizeClass === 'compact' ? '85%' : 'calc(100% - 1rem)';
}

/**
 * How far in from the window's right edge the page area must end so the Notes
 * sidebar pushes the page instead of covering it.
 *
 * @param open - Whether the Notes sidebar is showing.
 * @param sidebarWidth - The sidebar's width in pixels.
 * @param sizeClass - The Window size class; below expanded the sidebar is a sheet and takes no room.
 * @returns Pixels to reserve on the right; 0 while closed or while it is a sheet.
 */
export function getNotesPageInset(open: boolean, sidebarWidth: number, sizeClass: WindowSizeClass): number {
  return open && !isNotesSidebarSheet(sizeClass) ? sidebarWidth + NOTES_SIDEBAR_PAGE_GAP : 0;
}
