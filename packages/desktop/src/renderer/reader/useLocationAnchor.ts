import { useEffect, useRef, useState, type RefObject } from 'react';
import { offsetForPageLocation, type PageLocation } from '@taking-book/core';

/** Vertical extent of the laid-out pages, in scroll-content pixels. */
export interface AnchorEdges {
  /** Top of each page; `offsets[i]` is page `i + 1`. */
  offsets: number[];
  /** Bottom of the last page. */
  end: number;
}

export interface LocationAnchorOptions {
  /** The scroll container to position. */
  scrollRef: RefObject<HTMLElement | null>;
  /** Page to hold the view on; `undefined` means there is nothing to anchor to. */
  location: PageLocation | undefined;
  /** Measures the page tops from the committed DOM; null while nothing is laid out. */
  measureEdges: () => AnchorEdges | null;
  /** True once the anchored page's text is laid out and its position is final enough to scroll to. */
  ready: boolean;
  /** Changes whenever the layout may have moved (images arriving, text re-scaling, resizes). */
  layoutKey: unknown;
}

/** Input that means the reader is steering the view themselves. */
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Holds a scroll container on a page location handed over from the other
 * reading mode. Reflow layout is not final when the text first appears: pages
 * stream in, figures pop in above the viewport and the body size is rescaled at
 * the end, and each of those moves the target page. So the position is applied
 * as soon as the page is laid out and re-applied on every layout change, until
 * the reader scrolls, presses a key or clicks, at which point the view is theirs.
 *
 * @returns `settled`: false until the first application, so the caller can keep
 * the unpositioned text (which starts at page 1) from flashing on screen.
 */
export function useLocationAnchor({
  scrollRef,
  location,
  measureEdges,
  ready,
  layoutKey,
}: LocationAnchorOptions): boolean {
  const [settled, setSettled] = useState(location === undefined);
  const activeRef = useRef(location !== undefined);

  useEffect(() => {
    const release = () => {
      activeRef.current = false;
      setSettled(true);
    };
    for (const type of USER_INPUT_EVENTS) window.addEventListener(type, release, { passive: true });
    return () => {
      for (const type of USER_INPUT_EVENTS) window.removeEventListener(type, release);
    };
  }, []);

  useEffect(() => {
    if (!activeRef.current || location === undefined || !ready) return;
    const el = scrollRef.current;
    const edges = measureEdges();
    if (!el || !edges || edges.offsets.length === 0) return;
    el.scrollTop = offsetForPageLocation(edges.offsets, edges.end, location);
    setSettled(true);
  }, [scrollRef, location, measureEdges, ready, layoutKey]);

  return settled;
}
