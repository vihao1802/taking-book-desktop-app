import {
  detectShortcutPlatform,
  formatShortcutLabel,
  type ReaderShortcutAction,
  type ShortcutPlatform,
} from '@taking-book/core';

/** Detected once: the OS cannot change while the app is running. */
export const SHORTCUT_PLATFORM: ShortcutPlatform = detectShortcutPlatform(navigator.platform);

/**
 * Appends the platform's notation for a shortcut to a tooltip, e.g.
 * `Reflow (R)` or `Find (⌘F)`; returns the label unchanged when the action has none.
 */
export function withShortcutHint(label: string, action: ReaderShortcutAction): string {
  const hint = formatShortcutLabel(action, SHORTCUT_PLATFORM);
  return hint ? `${label} (${hint})` : label;
}
