import { useRef, type MouseEvent } from 'react';
import { isMiddleTap, shouldToggleOverlay } from './overlay-tap';

interface OverlayTapHandlers {
  /** Remembers whether a selection was there before the press, since the press itself clears it. */
  onPointerDownCapture: () => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

function hasSelection(): boolean {
  return window.getSelection()?.isCollapsed === false;
}

/**
 * Click handlers for a reading area that toggle the Overlay on a tap in its
 * middle, so the reading view needs no control of its own for it. A tap that
 * clears a selection, or a gesture that makes one, leaves the Overlay alone.
 *
 * @param onToggle - Shows the Overlay if it is hidden and hides it otherwise.
 */
export function useOverlayTap(onToggle: () => void): OverlayTapHandlers {
  const selectionBeforeRef = useRef(false);

  const onPointerDownCapture = () => {
    selectionBeforeRef.current = hasSelection();
  };

  const onClick = (event: MouseEvent<HTMLElement>) => {
    const area = event.currentTarget.getBoundingClientRect();
    const toggle = shouldToggleOverlay({
      middle: isMiddleTap({ x: event.clientX, y: event.clientY }, area),
      selectionBefore: selectionBeforeRef.current,
      selectionNow: hasSelection(),
    });
    selectionBeforeRef.current = false;
    if (toggle) onToggle();
  };

  return { onPointerDownCapture, onClick };
}
