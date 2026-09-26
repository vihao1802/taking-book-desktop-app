import { createScrollDismissal, type PopupScroller } from './popup-scroll-dismissal';
import { shouldCloseOnSelectionChange, type SelectionEnds } from './popup-selection-dismissal';

/**
 * What the dismissal needs from the page. Injected rather than read from the
 * globals so the wiring can be tested with plain event targets, without a DOM.
 */
export interface PopupDismissalOptions {
  /** Receives keydown and resize. */
  window: EventTarget;
  /** Receives pointerdown, selectionchange and scroll. */
  document: EventTarget;
  /** True when the node or event target lies inside the popup. */
  isInPopup: (target: unknown) => boolean;
  /** Which element scrolled, seen from the popup. */
  classifyScroller: (target: unknown) => PopupScroller;
  /** The selection now. */
  readSelection: () => SelectionEnds<unknown>;
  onClose: () => void;
}

interface Listener {
  target: EventTarget;
  type: string;
  handle: (event: Event) => void;
  capture: boolean;
}

/**
 * Attaches the rules that close a floating reader popup: Escape, a press
 * outside it, a change of the selection it was opened for, and a scroll of the
 * reader view. Call it once the popup is open; the selection at that moment is
 * the one the popup belongs to.
 *
 * @returns A function that detaches every listener.
 */
export function attachPopupDismissal(options: PopupDismissalOptions): () => void {
  // `{ capture }` rather than a bare boolean: Node's EventTarget (used by the
  // tests) only matches a removal to its add in the options form.
  const listeners = [...escapeAndPressListeners(options), selectionListener(options), ...scrollListeners(options)];
  for (const { target, type, handle, capture } of listeners) target.addEventListener(type, handle, { capture });
  return () => {
    for (const { target, type, handle, capture } of listeners) target.removeEventListener(type, handle, { capture });
  };
}

// The Escape listener is capture-phase and marks the event handled, so the
// Selection toolbar and the reader's own Escape layers (which skip handled
// events) leave it alone.
function escapeAndPressListeners({ window, document, isInPopup, onClose }: PopupDismissalOptions): Listener[] {
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    onClose();
  };
  const onPointerDown = (event: Event) => {
    if (!isInPopup(event.target)) onClose();
  };
  return [
    { target: window, type: 'keydown', handle: onKeyDown, capture: true },
    { target: document, type: 'pointerdown', handle: onPointerDown, capture: true },
  ];
}

// A press outside already closes the popup, but a keyboard change
// (Shift+Arrow) fires no press, and a late Translation must not appear for a
// selection the reader has moved on from.
function selectionListener({ document, isInPopup, readSelection, onClose }: PopupDismissalOptions): Listener {
  const opened = readSelection();
  const onSelectionChange = () => {
    const current = readSelection();
    const insidePopup = isInPopup(current.anchorNode) && isInPopup(current.focusNode);
    if (shouldCloseOnSelectionChange({ opened, current, insidePopup })) onClose();
  };
  return { target: document, type: 'selectionchange', handle: onSelectionChange, capture: false };
}

// Scroll does not bubble, so it is caught in the capture phase from any
// scroller; the resize time lets the reader's own re-layout scroll through.
function scrollListeners({ window, document, classifyScroller, onClose }: PopupDismissalOptions): Listener[] {
  const dismissal = createScrollDismissal();
  const onResize = (event: Event) => dismissal.recordResize(event.timeStamp);
  const onScroll = (event: Event) => {
    if (dismissal.shouldClose({ time: event.timeStamp, scroller: classifyScroller(event.target) })) onClose();
  };
  return [
    { target: window, type: 'resize', handle: onResize, capture: false },
    { target: document, type: 'scroll', handle: onScroll, capture: true },
  ];
}
