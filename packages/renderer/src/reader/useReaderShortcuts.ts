import { useEffect, useRef } from 'react';
import { resolveReaderShortcut, type ReaderShortcutAction } from '@taking-book/core';
import { SHORTCUT_PLATFORM } from './shortcutHint';

/** Handlers keyed by action; an action without a handler is left to the browser. */
export type ReaderShortcutHandlers = Partial<Record<ReaderShortcutAction, () => void>>;

// Widgets that own their keyboard (typeahead in a listbox, arrows in a menu)
// count as typing, so reader shortcuts never fire underneath an open popup.
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.closest('[role="listbox"], [role="menu"]') !== null
  );
}

/**
 * Routes reader keyboard shortcuts to the given handlers with one window
 * listener. Key matching (Cmd vs Ctrl, typing guard, modifier checks) lives in
 * core's `resolveReaderShortcut`; this hook only supplies the DOM facts.
 *
 * A key is left alone when a handler is absent, or when something closer to
 * the target (a Radix select closing on Escape, a slider stepping on an arrow)
 * already called `preventDefault`, so nested widgets keep priority.
 *
 * @param handlers - Action handlers; may change identity every render.
 * @param enabled - Turn the listener off, e.g. while another reader mode is active.
 */
export function useReaderShortcuts(handlers: ReaderShortcutHandlers, enabled = true): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const action = resolveReaderShortcut(event, {
        platform: SHORTCUT_PLATFORM,
        isTyping: isTypingTarget(event.target),
      });
      if (action === null) return;
      const handler = handlersRef.current[action];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
