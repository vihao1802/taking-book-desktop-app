import { useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import {
  SIDEBAR_KEYBOARD_STEP,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './sidebar-width';

interface SidebarResizeHandleProps {
  /** The panel being resized; its far edge stays fixed while this handle moves. */
  panelRef: RefObject<HTMLElement | null>;
  /** The panel edge the handle sits on: the right edge of a left panel, the left edge of a right panel. */
  edge: 'left' | 'right';
  /** Current panel width in pixels. */
  width: number;
  /** Called with the requested width while the user drags or uses the keyboard; the owner clamps it. */
  onWidthChange: (width: number) => void;
}

/**
 * Draggable, keyboard-operable strip on a sidebar's inner edge. The panel's
 * opposite edge is fixed, so the pointer's distance from it is the width the
 * user is asking for.
 */
export function SidebarResizeHandle({ panelRef, edge, width, onWidthChange }: SidebarResizeHandleProps) {
  const [dragging, setDragging] = useState(false);

  const resizeToPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    onWidthChange(edge === 'right' ? event.clientX - rect.left : rect.right - event.clientX);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  // Arrow keys move the edge the way the handle visibly moves: on a right-hand
  // panel the handle is on its left, so Left grows the panel.
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>): void => {
    const growKey = edge === 'right' ? 'ArrowRight' : 'ArrowLeft';
    const shrinkKey = edge === 'right' ? 'ArrowLeft' : 'ArrowRight';
    if (event.key === growKey) onWidthChange(width + SIDEBAR_KEYBOARD_STEP);
    else if (event.key === shrinkKey) onWidthChange(width - SIDEBAR_KEYBOARD_STEP);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={startResize}
      onPointerMove={(e) => {
        if (dragging) resizeToPointer(e);
      }}
      onPointerUp={finishResize}
      onPointerCancel={finishResize}
      onDoubleClick={() => onWidthChange(SIDEBAR_MIN_WIDTH)}
      onKeyDown={resizeWithKeyboard}
      className={cn(
        'absolute inset-y-0 w-1.5 cursor-col-resize outline-none transition-colors',
        edge === 'right' ? 'right-0' : 'left-0',
        'hover:bg-primary/30 focus-visible:bg-primary/30',
        dragging && 'bg-primary/40',
      )}
    />
  );
}
