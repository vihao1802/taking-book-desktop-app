import { useEffect, type RefObject } from 'react';
import { isSearchShortcut } from './search-shortcut';

/**
 * Focuses the given search input when the user presses `/` or Ctrl/Cmd+F.
 * Returns early when the focus is already inside a text entry field so that
 * typing a slash into an existing input is not hijacked.
 */
export function useSearchShortcut(inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (!isSearchShortcut(event)) return;
      if (typing) return;

      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inputRef]);
}
