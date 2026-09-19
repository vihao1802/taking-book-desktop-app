import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { offsetForPageLocation, pageLocationAtOffset, type IndexedTextMatch, type PageLocation } from '@taking-book/core';
import type { Annotation, AnnotationColor } from '../../shared/types';
import { pageFromOffset, type PageLayout } from './pdf';
import { PdfPageView, type PageTextSelection } from './PdfPageView';
import { groupMatchesByText } from './useDocumentSearch';

export interface PdfPagesHandle {
  scrollToPage: (page: number) => void;
}

interface PdfPagesProps {
  pdf: PDFDocumentProxy;
  layout: PageLayout;
  /** Effective (zoom-scaled) page width in CSS pixels. */
  containerWidth: number;
  containerHeight: number;
  dpr: number;
  initialPosition: number;
  /** Page position to open at (e.g. carried over from reflow); wins over `initialPosition`. */
  initialLocation?: PageLocation;
  onScrollPosition: (page: number, position: number) => void;
  /** Called as the view scrolls, with the page and how far down it the viewport top is. */
  onLocationChange?: (location: PageLocation) => void;
  onCurrentPage: (page: number) => void;
  pageTexts: string[];
  annotations: Annotation[];
  /** Find-bar matches over all pages, in reading order (`textIndex` is the page index). */
  searchMatches: IndexedTextMatch[];
  searchActiveIndex: number;
  searchScrollRequest: number;
  onCreate: (
    selection: PageTextSelection,
    color: AnnotationColor,
    note: string | null,
  ) => Promise<Annotation | null>;
  onSetNote: (id: number, note: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const NO_MATCHES: IndexedTextMatch[] = [];

export const PdfPages = forwardRef<PdfPagesHandle, PdfPagesProps>(function PdfPages(
  {
    pdf,
    layout,
    containerWidth,
    containerHeight,
    dpr,
    initialPosition,
    initialLocation,
    onScrollPosition,
    onLocationChange,
    onCurrentPage,
    pageTexts,
    annotations,
    searchMatches,
    searchActiveIndex,
    searchScrollRequest,
    onCreate,
    onSetNote,
    onDelete,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const restoredRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);

  const onScrollPositionRef = useRef(onScrollPosition);
  onScrollPositionRef.current = onScrollPosition;
  const onCurrentPageRef = useRef(onCurrentPage);
  onCurrentPageRef.current = onCurrentPage;
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  const currentPage = pageFromOffset(layout, scrollTop) + 1;

  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const st = el.scrollTop;
      setScrollTop(st);
      const page = pageFromOffset(layout, st) + 1;
      const scrollable = Math.max(layout.totalHeight - el.clientHeight, 0);
      const position = scrollable > 0 ? st / scrollable : 0;
      onCurrentPageRef.current(page);
      onScrollPositionRef.current(page, position);
      onLocationChangeRef.current?.(pageLocationAtOffset(layout.offsets, layout.totalHeight, st));
    });
  }, [layout]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || restoredRef.current) return;
    restoredRef.current = true;
    const scrollable = Math.max(layout.totalHeight - el.clientHeight, 0);
    const target = initialLocation
      ? offsetForPageLocation(layout.offsets, layout.totalHeight, initialLocation)
      : Math.min(initialPosition, 1) * scrollable;
    el.scrollTop = target;
    setScrollTop(target);
  }, [layout, initialPosition, initialLocation]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage: (page) => {
        const el = scrollRef.current;
        if (!el || page < 1 || page > layout.heights.length) return;
        el.scrollTo({ top: layout.offsets[page - 1], behavior: 'smooth' });
      },
    }),
    [layout],
  );

  const avgHeight = layout.totalHeight / Math.max(layout.heights.length, 1);
  const visibleCount = Math.max(1, Math.ceil(containerHeight / Math.max(avgHeight, 1)) + 1);
  const start = Math.max(0, currentPage - 2);
  const end = Math.min(layout.heights.length, currentPage + visibleCount);

  const matchGroups = useMemo(() => groupMatchesByText(searchMatches), [searchMatches]);

  // A new search request stays pending until the page holding the current match
  // has rendered its text layer and scrolled the match into view.
  const [pendingReveal, setPendingReveal] = useState(0);
  const handleRevealed = useCallback(
    (request: number) => setPendingReveal((pending) => (pending === request ? 0 : pending)),
    [],
  );
  useEffect(() => {
    setPendingReveal(searchScrollRequest);
  }, [searchScrollRequest]);

  // Pages far from the viewport are not mounted, so jump near the current
  // match first; its page then mounts and does the precise scroll itself. Only a
  // new request should jump, hence the single dependency.
  useEffect(() => {
    const el = scrollRef.current;
    const match = searchMatches[searchActiveIndex];
    if (pendingReveal === 0 || !el || !match) return;
    if (match.textIndex >= start && match.textIndex < end) return;
    el.scrollTo({ top: layout.offsets[match.textIndex] });
  }, [pendingReveal]);

  const slots = [];
  for (let i = start; i < end; i++) {
    const group = matchGroups.get(i);
    const activeInGroup = group ? searchActiveIndex - group.firstIndex : -1;
    slots.push(
      <div
        key={i}
        className="absolute left-0"
        style={{ top: layout.offsets[i], width: containerWidth, height: layout.heights[i] }}
      >
        <PdfPageView
          pdf={pdf}
          pageNumber={i + 1}
          cssScale={layout.scales[i]}
          dpr={dpr}
          pageText={pageTexts[i] ?? ''}
          annotations={annotations.filter((a) => a.page === i + 1)}
          searchMatches={group?.matches ?? NO_MATCHES}
          activeSearchMatch={group && activeInGroup >= 0 && activeInGroup < group.matches.length ? activeInGroup : null}
          pendingReveal={pendingReveal}
          onRevealed={handleRevealed}
          onCreate={onCreate}
          onSetNote={onSetNote}
          onDelete={onDelete}
        />
      </div>,
    );
  }

  return (
    <div
      className="absolute inset-0 overflow-x-auto overflow-y-auto"
      style={{ scrollbarGutter: 'stable' }}
      ref={scrollRef}
      onScroll={handleScroll}
    >
      <div
        className="relative"
        style={{ height: layout.totalHeight, width: containerWidth, marginInline: 'auto' }}
      >
        {slots}
      </div>
    </div>
  );
});