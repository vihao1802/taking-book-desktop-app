/**
 * How long after a window resize the reader may still be re-laying out. Both
 * reader modes restore the reading spot after a width change by setting the
 * scroll offset, and that scroll must not count as the reader scrolling.
 */
export const RESIZE_SETTLE_MS = 500;

/**
 * Which element scrolled, seen from a floating reader popup. The popup is
 * checked first: in page mode it sits inside the reader view's DOM.
 */
export type PopupScroller = 'popup' | 'reader-view' | 'other';

/** A scroll event as the dismissal sees it. */
export interface PopupScroll {
  /** When it happened, in milliseconds (event time stamp). */
  time: number;
  scroller: PopupScroller;
}

/** Decides which scrolls close a floating reader popup. */
export interface ScrollDismissal {
  /** Records a window resize, in milliseconds (event time stamp). */
  recordResize: (time: number) => void;
  /** True when the scroll moved the reader view, so the popup no longer sits by its selection. */
  shouldClose: (scroll: PopupScroll) => boolean;
}

/**
 * Creates the scroll rule for one open popup: a scroll of the reader view
 * closes it, while a scroll inside the popup, of a sidebar, or one caused by
 * the reader re-laying out after a window resize, does not.
 *
 * @returns A dismissal to feed the window's resize and scroll events.
 */
export function createScrollDismissal(): ScrollDismissal {
  let lastResize = Number.NEGATIVE_INFINITY;
  return {
    recordResize: (time) => {
      lastResize = time;
    },
    shouldClose: ({ time, scroller }) => scroller === 'reader-view' && time - lastResize > RESIZE_SETTLE_MS,
  };
}
