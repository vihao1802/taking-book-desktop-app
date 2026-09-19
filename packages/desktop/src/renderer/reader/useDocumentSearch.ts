import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { findMatchesInTexts, type IndexedTextMatch, type TextMatch } from '@taking-book/core';

/** State of the reader's find bar, shared by page and reflow modes. */
export interface DocumentSearch {
  open: boolean;
  query: string;
  matches: IndexedTextMatch[];
  /** Index into `matches` of the current match, or -1 when there is none. */
  activeIndex: number;
  /** Bumps whenever the current match should be scrolled into view. */
  scrollRequest: number;
  /** Bumps whenever the query field should take focus and select its text. */
  focusRequest: number;
  openBar: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  next: () => void;
  previous: () => void;
}

const NO_MATCHES: IndexedTextMatch[] = [];

/** The matches that fall inside one page or paragraph. */
export interface MatchGroup {
  /** Index into the flat match list of this group's first match. */
  firstIndex: number;
  matches: TextMatch[];
}

/** Buckets the flat, reading-ordered match list by the text entry each came from. */
export function groupMatchesByText(matches: readonly IndexedTextMatch[]): Map<number, MatchGroup> {
  const groups = new Map<number, MatchGroup>();
  matches.forEach((match, index) => {
    const group = groups.get(match.textIndex);
    if (group) group.matches.push(match);
    else groups.set(match.textIndex, { firstIndex: index, matches: [match] });
  });
  return groups;
}

/**
 * Owns the find bar: its visibility, query, and which match is current.
 *
 * @param texts - One entry per page (page mode) or paragraph (reflow mode).
 * @returns Search state plus the actions the find bar and shortcuts call.
 */
export function useDocumentSearch(texts: readonly string[]): DocumentSearch {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [rawActiveIndex, setRawActiveIndex] = useState(0);
  const [scrollRequest, setScrollRequest] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  // Searching every page on each keystroke can be heavy on a long book, so
  // typing stays responsive and the match list catches up.
  const deferredQuery = useDeferredValue(query);

  const matches = useMemo(
    () => (open ? findMatchesInTexts(texts, deferredQuery) : NO_MATCHES),
    [open, texts, deferredQuery],
  );
  const activeIndex = matches.length === 0 ? -1 : Math.min(rawActiveIndex, matches.length - 1);

  // Results can arrive after the user typed (text still loading, or the
  // deferred query catching up); reveal the first one when they do.
  const hasMatches = matches.length > 0;
  useEffect(() => {
    if (hasMatches) setScrollRequest((request) => request + 1);
  }, [hasMatches]);

  const openBar = useCallback(() => {
    setOpen(true);
    setFocusRequest((request) => request + 1);
    setScrollRequest((request) => request + 1);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setRawActiveIndex(0);
    setScrollRequest((request) => request + 1);
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (matches.length === 0) return;
      setRawActiveIndex((activeIndex + delta + matches.length) % matches.length);
      setScrollRequest((request) => request + 1);
    },
    [matches.length, activeIndex],
  );
  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => step(-1), [step]);

  return {
    open,
    query,
    matches,
    activeIndex,
    scrollRequest,
    focusRequest,
    openBar,
    close,
    setQuery,
    next,
    previous,
  };
}
