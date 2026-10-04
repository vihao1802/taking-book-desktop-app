/** Share of the reading area, from each edge, that does not count as the middle. */
const EDGE_SHARE = 0.2;

interface Area {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Whether a tap landed in the middle of the reading area, the only place that
 * toggles the Overlay: the edges are left to the bars and the sidebars.
 *
 * @param point - The tap in viewport coordinates.
 * @param area - The reading area's bounding rect.
 */
export function isMiddleTap(point: { x: number; y: number }, area: Area): boolean {
  const fromLeft = (point.x - area.left) / area.width;
  const fromTop = (point.y - area.top) / area.height;
  return (
    fromLeft >= EDGE_SHARE && fromLeft <= 1 - EDGE_SHARE && fromTop >= EDGE_SHARE && fromTop <= 1 - EDGE_SHARE
  );
}

/**
 * Decides whether a click on the page toggles the Overlay. A tap that clears a
 * selection, or a gesture that makes one, is about the selection, not the Overlay.
 */
export function shouldToggleOverlay(tap: { middle: boolean; selectionBefore: boolean; selectionNow: boolean }): boolean {
  return tap.middle && !tap.selectionBefore && !tap.selectionNow;
}
