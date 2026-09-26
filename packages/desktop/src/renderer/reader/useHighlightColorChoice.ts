import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SelectionAnchor } from './floating-placement';

interface HighlightColorChoice {
  open: boolean;
  toggle: () => void;
}

/**
 * Open/closed state of the Selection toolbar's color choice. It closes on
 * Escape, on a press outside `rootRef`, and when the toolbar moves to a new
 * selection (a keyboard selection change keeps the toolbar mounted).
 *
 * @param rootRef - The toolbar element; presses inside it keep the choice open.
 * @param anchor - The selection the toolbar belongs to; a change means a new selection.
 */
export function useHighlightColorChoice(
  rootRef: RefObject<HTMLElement | null>,
  anchor: SelectionAnchor,
): HighlightColorChoice {
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    setOpen(false);
  }, [anchor.left, anchor.top, anchor.bottom]);

  // Registered on mount rather than on open: the page view's own capture-phase
  // Escape listener (which closes the whole toolbar) is added after the
  // toolbar mounts, so this one runs first and its preventDefault tells the
  // readers the key was consumed.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !openRef.current) return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // The readers still decide on their own whether an outside press also
  // dismisses the toolbar.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, rootRef]);

  return { open, toggle: () => setOpen((value) => !value) };
}
