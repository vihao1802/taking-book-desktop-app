/** How far, in dp, a press may travel and still count as a tap; a drag or a scroll goes further. */
export const TAP_SLOP_DP = 10;

interface Point {
  x: number;
  y: number;
}

/** Whether a press that started at `start` and ended at `end` stayed put enough to be a tap. */
export function isTapMovement(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_SLOP_DP;
}

/**
 * Decides whether a click on the page toggles the Overlay. A tap anywhere on
 * the page does, so the reading view needs no control of its own for it. A
 * press that moved (a scroll or a drag), a tap that clears a selection, and a
 * gesture that makes one are not taps and leave the Overlay alone.
 */
export function shouldToggleOverlay(tap: { moved: boolean; selectionBefore: boolean; selectionNow: boolean }): boolean {
  return !tap.moved && !tap.selectionBefore && !tap.selectionNow;
}
