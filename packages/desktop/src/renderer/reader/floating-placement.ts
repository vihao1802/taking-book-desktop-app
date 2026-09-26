/** Where a text selection sits in the window. */
export interface SelectionAnchor {
  left: number;
  /** Top edge of the selection; floating elements flip above it when there is no room below. */
  top: number;
  /** Bottom edge of the selection; floating elements open below it by default. */
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface FloatingPlacement {
  left: number;
  top: number;
}

/** Space between the selection and the floating element. */
const SELECTION_GAP_PX = 8;
/** Space a floating element keeps from the window edges. */
const WINDOW_MARGIN_PX = 8;

/**
 * Places a floating element (the Selection toolbar, the Translation popup)
 * next to a selection so all of it stays inside the window: below the
 * selection by default, flipped above it when there is no room below, and
 * shifted sideways at the left or right edge.
 *
 * @param anchor - The selection's edges in window coordinates.
 * @param size - The element's measured size.
 * @param viewport - The window's inner size.
 * @returns The element's top-left corner in window coordinates.
 */
export function placeNearSelection(anchor: SelectionAnchor, size: Size, viewport: Size): FloatingPlacement {
  const maxLeft = viewport.width - size.width - WINDOW_MARGIN_PX;
  const left = Math.max(WINDOW_MARGIN_PX, Math.min(anchor.left, maxLeft));
  const below = anchor.bottom + SELECTION_GAP_PX;
  const fitsBelow = below + size.height <= viewport.height - WINDOW_MARGIN_PX;
  // A selection scrolled past the bottom edge leaves no room above it inside the window either.
  const maxTop = viewport.height - size.height - WINDOW_MARGIN_PX;
  const above = Math.min(anchor.top - SELECTION_GAP_PX - size.height, maxTop);
  const top = fitsBelow ? below : Math.max(WINDOW_MARGIN_PX, above);
  return { left, top };
}
