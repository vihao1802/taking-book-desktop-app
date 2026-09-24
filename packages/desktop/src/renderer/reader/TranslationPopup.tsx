import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { getLanguageName } from '@taking-book/core';
import type { Translation } from '../../shared/types';
import type { TranslationAnchor, TranslationPopupState } from './useTranslationPopup';

/** Space between the selection and the popup, matching the Selection toolbar's offset. */
const SELECTION_GAP_PX = 8;
/** Space the popup keeps from the window edges. */
const WINDOW_MARGIN_PX = 8;

interface TranslationPopupProps {
  popup: TranslationPopupState;
  onClose: () => void;
}

/**
 * Floating popup showing the Translation of the selection, opened from the
 * Selection toolbar's Translate button. It opens where the toolbar was, stays
 * inside the window, and closes on Escape (before any other layer) or on a
 * press outside it. Nothing in it is saved.
 */
export function TranslationPopup({ popup, onClose }: TranslationPopupProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const position = usePopupPosition(rootRef, popup);
  useDismissal(rootRef, onClose);

  const { result } = popup;
  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Translation"
      className="bg-overlay text-foreground fixed z-50 flex max-w-xs flex-col gap-1 rounded-lg px-3 py-2 text-sm shadow-lg backdrop-blur-md"
      style={{ left: position.left, top: position.top, visibility: position.measured ? 'visible' : 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {result === null ? (
        <p className="text-muted-foreground flex items-center gap-2" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Translating…
        </p>
      ) : result.ok ? (
        <TranslationText translation={result.data} />
      ) : (
        <p className="text-muted-foreground" role="alert">
          {result.error}
        </p>
      )}
    </div>
  );
}

function TranslationText({ translation }: { translation: Translation }) {
  const caption = languageCaption(translation);
  return (
    <>
      <p className="break-words select-text" lang={translation.targetLanguage}>
        {translation.text}
      </p>
      {caption && <p className="text-muted-foreground text-xs">{caption}</p>}
    </>
  );
}

// The detected language can be one the Settings list does not offer (Latin,
// say); its code is still more useful to the reader than no caption.
function languageCaption({ sourceLanguage, targetLanguage }: Translation): string | null {
  if (sourceLanguage === null) return null;
  const source = getLanguageName(sourceLanguage) ?? sourceLanguage;
  const target = getLanguageName(targetLanguage) ?? targetLanguage;
  return `${source} → ${target}`;
}

interface PopupPosition {
  left: number;
  top: number;
  /** False until the popup's size is known; it stays hidden so it never flashes off-screen. */
  measured: boolean;
}

/**
 * Places the popup below the selection, flipped above it when there is no room
 * below and shifted sideways to stay inside the window. Re-measured whenever
 * the content changes size (loading, then the Translation).
 */
function usePopupPosition(
  rootRef: RefObject<HTMLDivElement | null>,
  popup: TranslationPopupState,
): PopupPosition {
  const { anchor } = popup;
  const [position, setPosition] = useState<PopupPosition>({
    left: anchor.left,
    top: anchor.bottom + SELECTION_GAP_PX,
    measured: false,
  });

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const place = () => {
      const { width, height } = element.getBoundingClientRect();
      setPosition({ ...fitInWindow(anchor, { width, height }), measured: true });
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

function fitInWindow(anchor: TranslationAnchor, size: { width: number; height: number }): { left: number; top: number } {
  const maxLeft = window.innerWidth - size.width - WINDOW_MARGIN_PX;
  const left = Math.max(WINDOW_MARGIN_PX, Math.min(anchor.left, maxLeft));
  const below = anchor.bottom + SELECTION_GAP_PX;
  const fitsBelow = below + size.height <= window.innerHeight - WINDOW_MARGIN_PX;
  const above = anchor.top - SELECTION_GAP_PX - size.height;
  const top = fitsBelow ? below : Math.max(WINDOW_MARGIN_PX, above);
  return { left, top };
}

/**
 * Closes the popup on Escape and on a press outside it. The Escape listener is
 * capture-phase and marks the event handled, so the Selection toolbar and the
 * reader's own Escape layers (which skip handled events) leave it alone.
 */
function useDismissal(rootRef: RefObject<HTMLDivElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      onCloseRef.current();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [rootRef]);
}
