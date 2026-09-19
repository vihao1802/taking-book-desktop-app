/**
 * Pure keyboard-shortcut rules for the reader, shared so that "Cmd on macOS,
 * Ctrl elsewhere" and the "don't hijack typing" rules live in one testable
 * place instead of being re-derived in every key listener.
 */

export type ShortcutPlatform = 'mac' | 'other';

/** The subset of a DOM KeyboardEvent the rules need (keeps core DOM-free). */
export interface KeyInput {
  key: string;
  /** Physical key, used where Option/Alt changes `key` (macOS Option+G is "©"). */
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export type ReaderShortcutAction =
  | 'find'
  | 'findNext'
  | 'findPrevious'
  | 'goToPage'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'firstPage'
  | 'lastPage'
  | 'nextScreen'
  | 'previousScreen'
  | 'nextPage'
  | 'previousPage'
  | 'lineDown'
  | 'lineUp'
  | 'toggleThumbnails'
  | 'toggleOutline'
  | 'toggleReflow'
  | 'dismiss';

export interface ResolveShortcutOptions {
  platform: ShortcutPlatform;
  /** True when focus is in an input, textarea or contenteditable element. */
  isTyping: boolean;
}

/** Maps `navigator.platform` (or similar) to the shortcut platform. */
export function detectShortcutPlatform(platformString: string): ShortcutPlatform {
  return /mac|iphone|ipad|ipod/i.test(platformString) ? 'mac' : 'other';
}

// Cmd on macOS, Ctrl elsewhere. The other modifier must be absent so that,
// e.g., Ctrl+F on a Mac (emacs-style cursor movement) is left alone.
function hasPrimaryModifier(input: KeyInput, platform: ShortcutPlatform): boolean {
  return platform === 'mac' ? input.metaKey && !input.ctrlKey : input.ctrlKey && !input.metaKey;
}

function hasNoModifiers(input: KeyInput): boolean {
  return !input.ctrlKey && !input.metaKey && !input.altKey && !input.shiftKey;
}

// pdf.js's own viewer uses Primary+Alt+G for "go to page"; Primary+G is the
// platform-standard "find next", so it cannot be reused for navigation.
function resolvePrimaryShortcut(input: KeyInput): ReaderShortcutAction | null {
  const key = input.key.toLowerCase();
  if (input.altKey) {
    return input.code === 'KeyG' && !input.shiftKey ? 'goToPage' : null;
  }
  if (key === 'f' && !input.shiftKey) return 'find';
  if (key === 'g') return input.shiftKey ? 'findPrevious' : 'findNext';
  if (key === '=' || key === '+') return 'zoomIn';
  if (key === '-' || key === '_') return 'zoomOut';
  if (key === '0' && !input.shiftKey) return 'zoomFit';
  return null;
}

const PLAIN_KEY_ACTIONS: ReadonlyMap<string, ReaderShortcutAction> = new Map([
  ['Home', 'firstPage'],
  ['End', 'lastPage'],
  ['PageDown', 'nextScreen'],
  ['PageUp', 'previousScreen'],
  ['ArrowRight', 'nextPage'],
  ['ArrowLeft', 'previousPage'],
  ['ArrowDown', 'lineDown'],
  ['ArrowUp', 'lineUp'],
  ['t', 'toggleThumbnails'],
  ['o', 'toggleOutline'],
  ['r', 'toggleReflow'],
]);

function resolveUnmodifiedShortcut(input: KeyInput): ReaderShortcutAction | null {
  if (input.key === ' ' && !input.altKey) return input.shiftKey ? 'previousScreen' : 'nextScreen';
  if (!hasNoModifiers(input)) return null;
  return PLAIN_KEY_ACTIONS.get(input.key) ?? PLAIN_KEY_ACTIONS.get(input.key.toLowerCase()) ?? null;
}

/**
 * Decides which reader action, if any, a key press stands for.
 *
 * @param input - The pressed key and its modifier state.
 * @param options - The platform (Cmd vs Ctrl) and whether the user is typing.
 * @returns The action, or null when the key is not a reader shortcut. While
 *   typing, only Escape and modifier shortcuts resolve, so plain letters and
 *   arrows keep working inside text fields.
 */
export function resolveReaderShortcut(
  input: KeyInput,
  options: ResolveShortcutOptions,
): ReaderShortcutAction | null {
  if (input.key === 'Escape') return hasNoModifiers(input) ? 'dismiss' : null;
  if (input.key === 'F3') return input.shiftKey ? 'findPrevious' : 'findNext';
  if (hasPrimaryModifier(input, options.platform)) return resolvePrimaryShortcut(input);
  if (input.metaKey || input.ctrlKey) return null;
  if (options.isTyping) return null;
  return resolveUnmodifiedShortcut(input);
}

const SHORTCUT_LABELS: Partial<Record<ReaderShortcutAction, { mac: string; other: string }>> = {
  find: { mac: '⌘F', other: 'Ctrl+F' },
  findNext: { mac: '⌘G', other: 'F3' },
  findPrevious: { mac: '⇧⌘G', other: 'Shift+F3' },
  goToPage: { mac: '⌥⌘G', other: 'Ctrl+Alt+G' },
  zoomIn: { mac: '⌘+', other: 'Ctrl++' },
  zoomOut: { mac: '⌘-', other: 'Ctrl+-' },
  zoomFit: { mac: '⌘0', other: 'Ctrl+0' },
  firstPage: { mac: 'Home', other: 'Home' },
  lastPage: { mac: 'End', other: 'End' },
  toggleThumbnails: { mac: 'T', other: 'T' },
  toggleOutline: { mac: 'O', other: 'O' },
  toggleReflow: { mac: 'R', other: 'R' },
  dismiss: { mac: 'Esc', other: 'Esc' },
};

/**
 * Formats a shortcut for a tooltip using the platform's own notation.
 *
 * @param action - The action to describe.
 * @param platform - Selects `⌘F` style on macOS and `Ctrl+F` style elsewhere.
 * @returns The label, or null for actions that are not worth advertising.
 */
export function formatShortcutLabel(
  action: ReaderShortcutAction,
  platform: ShortcutPlatform,
): string | null {
  return SHORTCUT_LABELS[action]?.[platform] ?? null;
}
