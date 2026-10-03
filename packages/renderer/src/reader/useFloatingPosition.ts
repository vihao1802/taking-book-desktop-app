import { useLayoutEffect, useState, type RefObject } from 'react';
import { placeNearSelection, type FloatingPlacement, type SelectionAnchor } from './floating-placement';

interface FloatingPosition extends FloatingPlacement {
  /** False until the element's size is known; keep it hidden so it never flashes off-screen. */
  measured: boolean;
}

/**
 * Keeps a floating element next to a selection and inside the window. It is
 * re-placed whenever the element changes size (the Translation arriving, the
 * Highlight color choice opening) or the window is resized.
 *
 * @param rootRef - The floating element, measured for its size.
 * @param anchor - The selection it belongs to.
 */
export function useFloatingPosition(
  rootRef: RefObject<HTMLElement | null>,
  anchor: SelectionAnchor,
): FloatingPosition {
  const [position, setPosition] = useState<FloatingPosition>({ left: anchor.left, top: anchor.bottom, measured: false });

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const place = () => {
      const { width, height } = element.getBoundingClientRect();
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      setPosition({ ...placeNearSelection(anchor, { width, height }, viewport), measured: true });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [rootRef, anchor]);

  return position;
}
