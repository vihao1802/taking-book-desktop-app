import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  PAGE_PROBE_PX,
  offsetForPageLocation,
  pageLocationAtOffset,
  type IndexedTextMatch,
  type PageLocation,
} from '@taking-book/core';
import type { Annotation, AnnotationColor } from '@/reader-api';
import { pageFromOffset, type PageLayout } from './pdf';
import { PdfPageView, type PageTextSelection } from './PdfPageView';
import { groupMatchesByText } from './useDocumentSearch';
import type { FinishNoteJump, NoteJump } from './useNoteJump';

export interface PdfPagesHandle {
  /** Jumps to a page instantly; pass `smooth` for short hops like next/previous page. */
  scrollToPage: (page: number, options?: { smooth: boolean }) => void;
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
  onCreate: (selection: PageTextSelection, color: AnnotationColor) => Promise<Annotation | null>;
  onAddNote: (selection: PageTextSelection) => void;
  /** Called when the reader clicks a highlight, to edit its card in the Notes sidebar. */
  onOpenAnnotation: (annotation: Annotation) => void;
  /** A jump to a Note that this view still has to carry out; null when there is none. */
  noteJump: NoteJump | null;
  onNoteJumpDone: FinishNoteJump;
}

const NO_MATCHES: IndexedTextMatch[] = [];
const NO_ANNOTATIONS: Annotation[] = [];

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
    onAddNote,
    onOpenAnnotation,
    noteJump,
    onNoteJumpDone,
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

  // Raw scroll offset and the layout it was measured in. A width change shrinks
  // or grows the content, and the browser clamps the offset before any effect
  // can read it, so the location to hold has to be captured beforehand.
  const scrollTopRef = useRef(0);
  const anchoredLayoutRef = useRef({ layout, containerWidth });

  const handleScroll = useCallback(() => {
    if (scrollRef.current) scrollTopRef.current = scrollRef.current.scrollTop;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const st = el.scrollTop;
      // Rendering only depends on which page is under the viewport, so an offset
      // that stays on the same page keeps the old state and skips a re-render.
      setScrollTop((previous) => (pageFromOffset(layout, previous) === pageFromOffset(layout, st) ? previous : st));
      const page = pageFromOffset(layout, st) + 1;
      const scrollable = Math.max(layout.totalHeight - el.clientHeight, 0);
      const position = scrollable > 0 ? st / scrollable : 0;
      onCurrentPageRef.current(page);
      onScrollPositionRef.current(page, position);
      onLocationChangeRef.current?.(pageLocationAtOffset(layout.offsets, layout.totalHeight, st + PAGE_PROBE_PX));
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
    scrollTopRef.current = target;
    setScrollTop(target);
  }, [layout, initialPosition, initialLocation]);

  // When the page width changes (the Notes sidebar opening or closing, a zoom),
  // every page changes height, so an unchanged scroll offset would land on a
  // different page. Keep the same page and offset within it in view instead.
  useLayoutEffect(() => {
    const previous = anchoredLayoutRef.current;
    anchoredLayoutRef.current = { layout, containerWidth };
    const el = scrollRef.current;
    if (!el || !restoredRef.current || previous.containerWidth === containerWidth) return;
    const location = pageLocationAtOffset(previous.layout.offsets, previous.layout.totalHeight, scrollTopRef.current);
    const target = offsetForPageLocation(layout.offsets, layout.totalHeight, location);
    el.scrollTop = target;
    scrollTopRef.current = target;
    setScrollTop(target);
  }, [layout, containerWidth]);

  // The offset kept in state may sit on an older page than the real one: pages
  // are measured while the document is open, which moves the page boundaries
  // under an unchanged scroll offset. Catch it up whenever the layout changes.
  useEffect(() => {
    setScrollTop(scrollTopRef.current);
  }, [layout]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage: (page, options) => {
        const el = scrollRef.current;
        if (!el || page < 1 || page > layout.heights.length) return;
        el.scrollTo({ top: layout.offsets[page - 1], behavior: options?.smooth ? 'smooth' : 'instant' });
      },
    }),
    [layout],
  );

  const avgHeight = layout.totalHeight / Math.max(layout.heights.length, 1);
  const visibleCount = Math.max(1, Math.ceil(containerHeight / Math.max(avgHeight, 1)) + 1);
  const start = Math.max(0, currentPage - 2);
  const end = Math.min(layout.heights.length, currentPage + visibleCount);

  const matchGroups = useMemo(() => groupMatchesByText(searchMatches), [searchMatches]);

  // Grouped once per annotation change so each page gets a stable list: a fresh
  // array per render would make every page redo its highlight layout on scroll.
  const annotationsByPage = useMemo(() => {
    const byPage = new Map<number, Annotation[]>();
    for (const annotation of annotations) {
      const list = byPage.get(annotation.page);
      if (list) list.push(annotation);
      else byPage.set(annotation.page, [annotation]);
    }
    return byPage;
  }, [annotations]);

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

  // A Note on a page that is not mounted is brought near first; once mounted
  // the page centers the highlight itself. When its page is already mounted this
  // must not scroll to the page top, or it would undo that centering (children's
  // effects run first). A jump that cannot land on a passage ends here.
  useEffect(() => {
    const el = scrollRef.current;
    if (!noteJump || !el) return;
    const pageIndex = noteJump.annotation.page - 1;
    const pageMounted = pageIndex >= start && pageIndex < end;
    const hasPassage = noteJump.location === 'passage';
    if (!(hasPassage && pageMounted) && pageIndex >= 0 && pageIndex < layout.heights.length) {
      el.scrollTo({ top: layout.offsets[pageIndex], behavior: 'instant' });
    }
    if (!hasPassage) onNoteJumpDone(noteJump.request, noteJump.location === 'page');
  }, [noteJump]);

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
          annotations={annotationsByPage.get(i + 1) ?? NO_ANNOTATIONS}
          searchMatches={group?.matches ?? NO_MATCHES}
          activeSearchMatch={group && activeInGroup >= 0 && activeInGroup < group.matches.length ? activeInGroup : null}
          pendingReveal={pendingReveal}
          onRevealed={handleRevealed}
          onCreate={onCreate}
          onAddNote={onAddNote}
          onOpenAnnotation={onOpenAnnotation}
          noteJump={noteJump?.location === 'passage' && noteJump.annotation.page === i + 1 ? noteJump : null}
          onNoteJumpDone={onNoteJumpDone}
        />
      </div>,
    );
  }

  return (
    <div
      className="absolute inset-0 overflow-x-auto overflow-y-auto"
      style={{ scrollbarGutter: 'stable' }}
      ref={scrollRef}
      data-reader-view
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