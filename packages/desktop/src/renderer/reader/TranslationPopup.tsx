import { useEffect, useRef, type ReactElement, type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { getLanguageName } from '@taking-book/core';
import type { Translation } from '../../shared/types';
import type { TranslationPopupState } from './useTranslationPopup';
import { useFloatingPosition } from './useFloatingPosition';
import { attachPopupDismissal } from './popup-dismissal';
import type { PopupScroller } from './popup-scroll-dismissal';
import type { SelectionEnds } from './popup-selection-dismissal';

/** The reader's scroll containers (PdfPages and ReflowReader), whose scrolling closes the popup. */
const READER_VIEW_SELECTOR = '[data-reader-view]';

interface TranslationPopupProps {
  popup: TranslationPopupState;
  onClose: () => void;
}

/**
 * Floating popup showing the Translation of the selection, opened from the
 * Selection toolbar's Translate button. It opens where the toolbar was, stays
 * inside the window, and closes on Escape (before any other layer), on a
 * press outside it, when the selection changes (keyboard included), or when
 * the reader view scrolls away from the selection.
 * Nothing in it is saved.
 */
export function TranslationPopup({ popup, onClose }: TranslationPopupProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const position = useFloatingPosition(rootRef, popup.anchor);
  usePopupDismissal(rootRef, onClose);

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

/**
 * Closes the popup on Escape, on a press outside it, when its selection
 * changes, or when the reader view scrolls (see `attachPopupDismissal`).
 */
function usePopupDismissal(rootRef: RefObject<HTMLDivElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(
    () =>
      attachPopupDismissal({
        window,
        document,
        isInPopup: (target) => isInside(rootRef.current, target),
        classifyScroller: (target) => classifyScroller(target, rootRef.current),
        readSelection: readSelectionEnds,
        onClose: () => onCloseRef.current(),
      }),
    [rootRef],
  );
}

function readSelectionEnds(): SelectionEnds<Node> {
  const selection = window.getSelection();
  return {
    anchorNode: selection?.anchorNode ?? null,
    anchorOffset: selection?.anchorOffset ?? 0,
    focusNode: selection?.focusNode ?? null,
    focusOffset: selection?.focusOffset ?? 0,
  };
}

function isInside(popup: HTMLElement | null, target: unknown): boolean {
  return popup !== null && target instanceof Node && popup.contains(target);
}

// Nested scrollers in the reader view (a wide code block in reflow text) count
// as the reader view: scrolling them moves text under the popup too.
function classifyScroller(target: unknown, popup: HTMLElement | null): PopupScroller {
  if (!(target instanceof Element)) return 'other';
  if (popup?.contains(target)) return 'popup';
  return target.closest(READER_VIEW_SELECTOR) ? 'reader-view' : 'other';
}
