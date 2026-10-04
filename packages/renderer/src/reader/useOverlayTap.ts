import { useRef, type MouseEvent, type PointerEvent } from 'react';
import { isTapMovement, shouldToggleOverlay } from './overlay-tap';

interface OverlayTapHandlers {
  /** Remembers where the press began and whether a selection was there, since the press itself clears it. */
  onPointerDownCapture: (event: PointerEvent<HTMLElement>) => void;
  onClick: (event: MouseEvent<HTMLElement>) => void;
}

function hasSelection(): boolean {
  return window.getSelection()?.isCollapsed === false;
}

/**
 * Click handlers for a reading area that toggle the Overlay on a tap, so the
 * reading view needs no control of its own for it. Scrolling or dragging, a
 * tap that clears a selection, and a gesture that makes one leave it alone.
 *
 * @param onToggle - Shows the Overlay if it is hidden and hides it otherwise.
 */
export function useOverlayTap(onToggle: () => void): OverlayTapHandlers {
  const pressRef = useRef({ x: 0, y: 0, selectionBefore: false });

  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    pressRef.current = { x: event.clientX, y: event.clientY, selectionBefore: hasSelection() };
  };

  const onClick = (event: MouseEvent<HTMLElement>) => {
    const press = pressRef.current;
    const toggle = shouldToggleOverlay({
      moved: !isTapMovement(press, { x: event.clientX, y: event.clientY }),
      selectionBefore: press.selectionBefore,
      selectionNow: hasSelection(),
    });
    pressRef.current = { ...press, selectionBefore: false };
    if (toggle) onToggle();
  };

  return { onPointerDownCapture, onClick };
}
