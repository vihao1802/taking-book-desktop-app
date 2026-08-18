import { useEffect, type RefObject } from 'react';

/**
 * Focuses the given search input when the user presses `/` or Ctrl/Cmd+K.
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

      const isSlash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      const isSearchCommand = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';

      if (!isSlash && !isSearchCommand) return;
      if (typing) return;

      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [inputRef]);
}
