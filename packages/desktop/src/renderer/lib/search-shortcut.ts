/** The parts of a key press that decide whether it is the search shortcut. */
export interface ShortcutKeys {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * Whether a key press asks to focus a view's search field: Ctrl/Cmd+F, or a
 * bare `/`.
 */
export function isSearchShortcut(keys: ShortcutKeys): boolean {
  const isSlash = keys.key === '/' && !keys.metaKey && !keys.ctrlKey && !keys.altKey;
  const isFind = (keys.metaKey || keys.ctrlKey) && keys.key.toLowerCase() === 'f';
  return isSlash || isFind;
}
