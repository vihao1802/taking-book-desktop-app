import { describe, expect, it } from 'vitest';
import { attachPopupDismissal } from './popup-dismissal';
import type { PopupScroller } from './popup-scroll-dismissal';
import type { SelectionEnds } from './popup-selection-dismissal';

// Plain objects stand in for DOM nodes; Node's own EventTarget stands in for
// the window and document, so no DOM environment is needed.
const word = { name: 'word' };
const nextWord = { name: 'next word' };
const popupText = { name: 'popup text' };
const readerView = { name: 'reader view' };
const sidebar = { name: 'notes sidebar' };

const openedSelection: SelectionEnds<unknown> = { anchorNode: word, anchorOffset: 0, focusNode: word, focusOffset: 4 };

function openPopup() {
  const page = { window: new EventTarget(), document: new EventTarget() };
  let selection = openedSelection;
  let closes = 0;
  const detach = attachPopupDismissal({
    ...page,
    isInPopup: (target) => target === popupText,
    classifyScroller: (target): PopupScroller =>
      target === popupText ? 'popup' : target === readerView ? 'reader-view' : 'other',
    readSelection: () => selection,
    onClose: () => {
      closes += 1;
    },
  });
  return {
    ...page,
    detach,
    closes: () => closes,
    select: (next: SelectionEnds<unknown>) => {
      selection = next;
      page.document.dispatchEvent(new Event('selectionchange'));
    },
  };
}

function eventOn(type: string, target: unknown, init: EventInit & { key?: string } = {}): Event {
  const event = new Event(type, { cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  if (init.key !== undefined) Object.defineProperty(event, 'key', { value: init.key });
  return event;
}

describe('attachPopupDismissal', () => {
  it('keeps the popup open as it opens, while the selection is still the one it opened for', () => {
    const popup = openPopup();
    popup.select({ ...openedSelection });
    expect(popup.closes()).toBe(0);
  });

  it('closes the popup when the selection is extended with the keyboard', () => {
    const popup = openPopup();
    popup.select({ ...openedSelection, focusOffset: 5 });
    expect(popup.closes()).toBe(1);
  });

  it('keeps the popup open when the reader selects the Translation text inside it', () => {
    const popup = openPopup();
    popup.select({ anchorNode: popupText, anchorOffset: 0, focusNode: popupText, focusOffset: 3 });
    expect(popup.closes()).toBe(0);
  });

  it('closes the popup on a press outside it, but not on a press inside it', () => {
    const popup = openPopup();
    popup.document.dispatchEvent(eventOn('pointerdown', popupText));
    expect(popup.closes()).toBe(0);
    popup.document.dispatchEvent(eventOn('pointerdown', nextWord));
    expect(popup.closes()).toBe(1);
  });

  it('closes the popup on Escape and marks the key handled', () => {
    const popup = openPopup();
    const escape = eventOn('keydown', null, { key: 'Escape' });
    popup.window.dispatchEvent(escape);
    expect(popup.closes()).toBe(1);
    expect(escape.defaultPrevented).toBe(true);
  });

  it('leaves an Escape that another layer already handled alone', () => {
    const popup = openPopup();
    const escape = eventOn('keydown', null, { key: 'Escape' });
    escape.preventDefault();
    popup.window.dispatchEvent(escape);
    expect(popup.closes()).toBe(0);
  });

  it('closes the popup when the reader view scrolls, but not when the popup or a sidebar does', () => {
    const popup = openPopup();
    popup.document.dispatchEvent(eventOn('scroll', popupText));
    popup.document.dispatchEvent(eventOn('scroll', sidebar));
    expect(popup.closes()).toBe(0);
    popup.document.dispatchEvent(eventOn('scroll', readerView));
    expect(popup.closes()).toBe(1);
  });

  it('keeps the popup open while the reader re-lays out right after a window resize', () => {
    const popup = openPopup();
    popup.window.dispatchEvent(new Event('resize'));
    popup.document.dispatchEvent(eventOn('scroll', readerView));
    expect(popup.closes()).toBe(0);
  });

  it('stops listening once detached', () => {
    const popup = openPopup();
    popup.detach();
    popup.select({ ...openedSelection, focusOffset: 5 });
    popup.document.dispatchEvent(eventOn('pointerdown', nextWord));
    popup.window.dispatchEvent(eventOn('keydown', null, { key: 'Escape' }));
    popup.document.dispatchEvent(eventOn('scroll', readerView));
    expect(popup.closes()).toBe(0);
  });
});
