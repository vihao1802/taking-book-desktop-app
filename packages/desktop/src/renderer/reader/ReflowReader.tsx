import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2 } from 'lucide-react';
import {
  getParagraphTextAlign,
  offsetForPageLocation,
  pageIndexAtOffset,
  pageLocationAtOffset,
  stepZoomMultiplier,
  type PageLocation,
  type PositionedReflowImage,
  type ReflowParagraph,
  type ReflowRun,
} from '@taking-book/core';
import type { Annotation, AnnotationColor, BookFile, CreateAnnotationInput } from '../../shared/types';
import type { ReflowProgress } from './useReflowDocument';
import { Button } from '@/components/ui/button';
import { Overlay } from './Overlay';
import { SidebarPanel, type SidebarTab } from './SidebarPanel';
import { OutlineView } from './OutlineView';
import { NotesSidebar } from './NotesSidebar';
import type { NotesSidebarState } from './useNotesSidebar';
import { usePdfOutline } from './usePdfOutline';
import { usePersistedSidebarWidth } from './usePersistedSidebarWidth';
import { AnnotationPopup } from './AnnotationPopup';
import { SelectionToolbar } from './SelectionToolbar';
import { ReflowFigure } from './ReflowFigure';
import {
  findRangeIgnoringWhitespace,
  HIGHLIGHT_FILL,
  rangeFromOffsets,
  rangeGlobalOffsets,
  selectionRect,
} from './highlights';
import { ReaderBars } from './ReaderBars';
import { clearSearchHighlights, setSearchHighlights } from './searchHighlights';
import type { DocumentSearch } from './useDocumentSearch';
import { useFullScreen } from './useFullScreen';
import { useLocationAnchor } from './useLocationAnchor';
import { useReaderShortcuts } from './useReaderShortcuts';

const HIDE_DELAY_MS = 2500;
/** Table-of-contents entries: indent per nesting level, and the shortest dotted leader before the page number (em). */
const CONTENTS_INDENT_EM = 1.25;
const CONTENTS_LEADER_MIN_EM = 1.5;
const CONTENTS_LEADER_OPACITY = 0.45;
/** Keyboard paging: fraction of the viewport a screen step scrolls, and a line step in px. */
const SCREEN_STEP_RATIO = 0.9;
const LINE_STEP_PX = 48;
/**
 * A page counts as current once its top is within this many px of the viewport
 * top. Page tops are fractional layout positions while scrollTop is rounded, so
 * a page scrolled to exactly would otherwise read as the previous one.
 */
const PAGE_PROBE_PX = 2;
/** Matches painted on each side of the current one; a common word can match tens of thousands of times. */
const SEARCH_HIGHLIGHT_WINDOW = 500;

/** One block in the reflow flow: a text paragraph or a figure. */
type FlowItem = { kind: 'para'; para: ReflowParagraph; index: number } | { kind: 'image'; image: PositionedReflowImage };

function flowItemPage(item: FlowItem): number {
  return item.kind === 'image' ? item.image.pageIndex : item.para.pageIndex;
}

/** One contiguous stretch of selected text inside a single reflow paragraph. */
interface ReflowSelection {
  index: number;
  start: number;
  end: number;
  quote: string;
}

interface ReflowReaderProps {
  file: BookFile;
  pdf: PDFDocumentProxy | null;
  paragraphs: ReflowParagraph[];
  images: PositionedReflowImage[];
  pageTexts: string[];
  error: string | null;
  progress: ReflowProgress | null;
  onClose: () => void;
  onToggleMode: () => void;
  /** Page position to open at: carried over from page mode, or restored from the last session. */
  initialLocation?: PageLocation;
  /** Called as the reader scrolls, with the page and how far down it the viewport top is. */
  onLocationChange?: (location: PageLocation) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  search: DocumentSearch;
  onOpenFind: () => void;
  /** Non-zero while the go-to-page bar is open. */
  goToRequest: number;
  onOpenGoTo: () => void;
  onCloseGoTo: () => void;
  annotations: Annotation[];
  onCreate: (input: CreateAnnotationInput) => Promise<Annotation | null>;
  onSetNote: (id: number, note: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  /** The Notes sidebar, whose state lives in the reader so it survives a mode toggle. */
  notesSidebar: NotesSidebarState;
  getImageData: (pageIndex: number, ref: string) => Promise<unknown>;
}

export function ReflowReader({
  file,
  pdf,
  paragraphs,
  images,
  pageTexts,
  error,
  progress,
  onClose,
  onToggleMode,
  initialLocation,
  onLocationChange,
  zoom,
  onZoomChange,
  search,
  onOpenFind,
  goToRequest,
  onOpenGoTo,
  onCloseGoTo,
  annotations,
  onCreate,
  onSetNote,
  onDelete,
  notesSidebar,
  getImageData,
}: ReflowReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const { fullScreen, toggleFullScreen } = useFullScreen();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ items: ReflowSelection[]; x: number; y: number } | null>(null);
  const [activePopup, setActivePopup] = useState<{ annotation: Annotation; x: number; y: number } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null);
  const [sidebarWidth, setSidebarWidth] = usePersistedSidebarWidth();
  const { nodes: outlineNodes, loading: outlineLoading } = usePdfOutline(pdf);
  const hideTimerRef = useRef<number>(0);
  const rafRef = useRef(0);

  // Body font size the zoom multiplier is relative to. Computed once per
  // document instead of per render (and without a spread that can blow the
  // argument limit on books with tens of thousands of paragraphs). Table rows
  // keep their small original size, so they are excluded here.
  const baseSize = useMemo(() => {
    let max = 0;
    for (const para of paragraphs) {
      if (para.isTable) continue;
      if (para.fontSize > max) max = para.fontSize;
    }
    return Math.max(max, 11);
  }, [paragraphs]);

  // Highlights touching each paragraph, indexed once per annotation change so
  // Paragraph renders stay O(their own marks) instead of filtering the whole
  // list per paragraph.
  const annotationsByPara = useMemo(() => {
    const byPara = new Map<number, Annotation[]>();
    for (const a of annotations) {
      if (a.paraIndex == null || a.paraStart == null || a.paraEnd == null) continue;
      const list = byPara.get(a.paraIndex);
      if (list) list.push(a);
      else byPara.set(a.paraIndex, [a]);
    }
    for (const list of byPara.values()) list.sort((a, b) => (a.paraStart ?? 0) - (b.paraStart ?? 0));
    return byPara;
  }, [annotations]);

  // The visual flow interleaves figures with paragraphs: each figure renders
  // just before the paragraph it was anchored to. Figures sorted by the core
  // engine keep their top-to-bottom order when grouped by anchor.
  const flowItems = useMemo(() => {
    const byAnchor = new Map<number, PositionedReflowImage[]>();
    for (const image of images) {
      const list = byAnchor.get(image.beforeParagraphIndex);
      if (list) list.push(image);
      else byAnchor.set(image.beforeParagraphIndex, [image]);
    }
    const items: FlowItem[] = [];
    for (let i = 0; i <= paragraphs.length; i++) {
      for (const image of byAnchor.get(i) ?? []) items.push({ kind: 'image', image });
      if (i < paragraphs.length) items.push({ kind: 'para', para: paragraphs[i], index: i });
    }
    return items;
  }, [paragraphs, images]);

  // Every PDF page gets a section, even ones with no text, so reflow numbers
  // pages exactly like page mode. While extraction is still streaming only the
  // pages read so far exist yet.
  const pageSections = useMemo(() => {
    let lastPageIndex = -1;
    for (const item of flowItems) lastPageIndex = Math.max(lastPageIndex, flowItemPage(item));
    const pageCount = progress === null ? Math.max(pdf?.numPages ?? 0, lastPageIndex + 1) : lastPageIndex + 1;
    const sections: FlowItem[][] = Array.from({ length: pageCount }, () => []);
    for (const item of flowItems) sections[flowItemPage(item)].push(item);
    return sections;
  }, [flowItems, progress, pdf]);

  // Top of each page section (and the bottom of the last) in scroll-content
  // coordinates, measured from the DOM: text height per page is unknowable
  // ahead of layout, so the page under the viewport can only be found by
  // looking at where the sections actually landed.
  const [pageEdges, setPageEdges] = useState<PageEdges>(NO_PAGE_EDGES);
  const pageEdgesRef = useRef(pageEdges);
  pageEdgesRef.current = pageEdges;

  const measurePages = useCallback(() => {
    const container = scrollRef.current;
    const article = articleRef.current;
    if (!container || !article) return;
    const next = measurePageEdges(container, article);
    setPageEdges((current) => (samePageEdges(current, next) ? current : next));
  }, []);

  // Sections move whenever the text re-wraps (zoom, window resize) or a page
  // is added, so re-measure after those layouts, and on any later change to
  // the article's height.
  const hasArticle = paragraphs.length > 0;
  useLayoutEffect(measurePages, [measurePages, pageSections, zoom]);
  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measurePages);
    });
    observer.observe(article);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measurePages, hasArticle]);

  const currentPage = pageIndexAtOffset(pageEdges.offsets, scrollTop + PAGE_PROBE_PX) + 1;
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  // While a location handed in through `initialLocation` is still being applied,
  // the layout is only partly measured, so a location read from it would be
  // wrong (usually page 1) and would overwrite the position being restored.
  const positionedRef = useRef(false);

  const lastLocationRef = useRef<PageLocation | null>(null);

  const reportLocation = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !positionedRef.current) return;
    const { offsets, end } = pageEdgesRef.current;
    const location = pageLocationAtOffset(offsets, end, el.scrollTop + PAGE_PROBE_PX);
    lastLocationRef.current = location;
    onLocationChangeRef.current?.(location);
  }, []);

  // The overlay must not disappear while the user is typing (e.g. the custom
  // zoom field): focus in an editable element means an active editing session,
  // not a paused one.
  const isEditingText = useCallback(() => {
    const target = document.activeElement as HTMLElement | null;
    return (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    );
  }, []);

  const startHideTimer = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    if (isEditingText()) return;
    hideTimerRef.current = window.setTimeout(() => setOverlayVisible(false), HIDE_DELAY_MS);
  }, [isEditingText]);

  const reveal = useCallback(() => {
    setOverlayVisible(true);
    startHideTimer();
  }, [startHideTimer]);

  const handleClick = useCallback(() => {
    // A fresh text selection also produces a click after mouseup; don't clear
    // its toolbar while the selection is still active.
    const selection = window.getSelection();
    const hasSelection =
      selection &&
      !selection.isCollapsed &&
      selection.rangeCount > 0 &&
      articleRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer);
    if (!hasSelection) {
      setSelectionToolbar(null);
      setActivePopup(null);
    }
    setOverlayVisible((visible) => {
      if (visible) {
        window.clearTimeout(hideTimerRef.current);
        return false;
      }
      startHideTimer();
      return true;
    });
  }, [startHideTimer]);

  const scrollToPage = useCallback((page: number) => {
    const el = scrollRef.current;
    const { offsets } = pageEdgesRef.current;
    if (!el || page < 1 || page > offsets.length) return;
    // Sidebar, slider and go-to-page are jumps; animating across many pages felt slow.
    el.scrollTo({ top: offsets[page - 1], behavior: 'instant' });
  }, []);

  // Scroll updates are coalesced to one state write per frame; a raw setState
  // per scroll event re-rendered the whole article on every tick.
  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      reportLocation();
    });
  }, [reportLocation]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // A page handed over from page mode, or restored from the last session, is
  // held until the reader takes over.
  // Measuring the DOM here (not the `pageEdges` state) matters: that state can
  // still describe the empty sections rendered before any text arrived, whose
  // offsets are all ~0 and would land on page 1. Pages stream in top to bottom,
  // so the target page's top is already final once the page after it exists.
  const measureEdges = useCallback((): PageEdges | null => {
    const container = scrollRef.current;
    const article = articleRef.current;
    return container && article ? measurePageEdges(container, article) : null;
  }, []);
  const anchorReady =
    paragraphs.length > 0 &&
    initialLocation !== undefined &&
    (progress === null || pageSections.length > initialLocation.page);
  const positioned = useLocationAnchor({
    scrollRef,
    location: initialLocation,
    measureEdges,
    ready: anchorReady,
    layoutKey: pageEdges,
  });
  positionedRef.current = positioned;

  // The Notes sidebar changes the width the text wraps to, which moves every
  // page boundary under an unchanged scroll offset. Hold the reading spot across
  // that re-wrap: the last reported location is still the pre-wrap one here.
  const notesInset = notesSidebar.pageInset;
  useLayoutEffect(() => {
    const location = lastLocationRef.current ?? initialLocation;
    const el = scrollRef.current;
    const edges = measureEdges();
    if (!location || !el || !edges || edges.offsets.length === 0 || !positionedRef.current) return;
    el.scrollTop = offsetForPageLocation(edges.offsets, edges.end, location) - PAGE_PROBE_PX;
  }, [notesInset, measureEdges, initialLocation]);

  const scrollReflow = useCallback((targetFor: (el: HTMLDivElement) => number) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: targetFor(el), behavior: 'smooth' });
  }, []);

  const clearSelectionUi = () => {
    setSelectionToolbar(null);
    setActivePopup(null);
  };

  // Escape peels off one layer at a time: selection toolbar / note popup, find
  // bar, go-to bar, Notes sidebar, Reader sidebar, then the reader itself.
  const dismiss = () => {
    if (selectionToolbar || activePopup) clearSelectionUi();
    else if (search.open) search.close();
    else if (goToRequest !== 0) onCloseGoTo();
    else if (notesSidebar.open) notesSidebar.close();
    else if (sidebarTab !== null) setSidebarTab(null);
    else onClose();
  };

  // Keyboard paging mirrors the page view so scrolling reflow text feels the
  // same: PageDown/PageUp/Space advance by a screen, up/down arrows nudge.
  useReaderShortcuts({
    find: onOpenFind,
    findNext: () => (search.open ? search.next() : onOpenFind()),
    findPrevious: () => (search.open ? search.previous() : onOpenFind()),
    goToPage: onOpenGoTo,
    zoomIn: () => {
      const stepped = stepZoomMultiplier(zoom, 'in');
      if (stepped !== null) onZoomChange(stepped);
    },
    zoomOut: () => {
      const stepped = stepZoomMultiplier(zoom, 'out');
      if (stepped !== null) onZoomChange(stepped);
    },
    zoomFit: () => onZoomChange(1),
    firstPage: () => scrollReflow(() => 0),
    lastPage: () => scrollReflow((el) => el.scrollHeight),
    nextScreen: () => scrollReflow((el) => el.scrollTop + Math.max(el.clientHeight * SCREEN_STEP_RATIO, 1)),
    previousScreen: () => scrollReflow((el) => el.scrollTop - Math.max(el.clientHeight * SCREEN_STEP_RATIO, 1)),
    lineDown: () => scrollReflow((el) => el.scrollTop + LINE_STEP_PX),
    lineUp: () => scrollReflow((el) => el.scrollTop - LINE_STEP_PX),
    toggleOutline: () => setSidebarTab((current) => (current === 'outlines' ? null : 'outlines')),
    toggleNotes: notesSidebar.toggle,
    toggleReflow: onToggleMode,
    dismiss,
  });

  // Paint find-bar matches with the CSS Custom Highlight API. Only a window
  // around the current match is painted (see SEARCH_HIGHLIGHT_WINDOW).
  const { open: searchOpen, matches: searchMatches, activeIndex: searchActiveIndex, scrollRequest } = search;
  useEffect(() => {
    const article = articleRef.current;
    if (!article || !searchOpen || searchMatches.length === 0) return;
    const paragraphElements = article.querySelectorAll('p');
    const first = Math.max(0, searchActiveIndex - SEARCH_HIGHLIGHT_WINDOW);
    const last = Math.min(searchMatches.length, searchActiveIndex + SEARCH_HIGHLIGHT_WINDOW + 1);
    const ranges: Range[] = [];
    let active: Range | null = null;
    for (let i = first; i < last; i++) {
      const match = searchMatches[i];
      const element = paragraphElements[match.textIndex];
      const range = element ? rangeFromOffsets(element, match.start, match.end) : null;
      if (!range) continue;
      ranges.push(range);
      if (i === searchActiveIndex) active = range;
    }
    setSearchHighlights('reflow', ranges, active);
    return () => clearSearchHighlights('reflow');
  }, [searchOpen, searchMatches, searchActiveIndex, annotations, paragraphs, zoom]);

  // Bring the current match to the middle of the view once per search request.
  const handledScrollRequestRef = useRef(0);
  useEffect(() => {
    if (!searchOpen || searchActiveIndex < 0 || scrollRequest === handledScrollRequestRef.current) return;
    const match = searchMatches[searchActiveIndex];
    const element = articleRef.current?.querySelectorAll('p')[match.textIndex];
    if (!element) return;
    const range = rangeFromOffsets(element, match.start, match.end);
    (range?.startContainer.parentElement ?? element).scrollIntoView({ block: 'center', behavior: 'smooth' });
    handledScrollRequestRef.current = scrollRequest;
  }, [searchOpen, searchMatches, searchActiveIndex, scrollRequest]);

  const handleMouseUp = useCallback(() => {
    const article = articleRef.current;
    if (!article) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSelectionToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const offsets = rangeGlobalOffsets(article, range);
    const rect = selectionRect();
    if (!offsets || !rect || !article.contains(range.commonAncestorContainer)) {
      setSelectionToolbar(null);
      return;
    }
    const [globalStart, globalEnd] = offsets;
    const items = selectionToParagraphs(article, globalStart, globalEnd);
    if (items.length === 0) {
      setSelectionToolbar(null);
      return;
    }
    setActivePopup(null);
    setSelectionToolbar({ items, x: rect.left, y: rect.bottom + 8 });
  }, []);

  const anchorFor = useCallback(
    (item: ReflowSelection, color: AnnotationColor, note: string | null): CreateAnnotationInput => {
      const para = paragraphs[item.index];
      const page = para.pageIndex + 1;
      const quote = item.quote;
      const pageRange = pageTexts[page - 1] ? findRangeIgnoringWhitespace(pageTexts[page - 1], quote) : null;
      return {
        page,
        pageStart: pageRange?.[0] ?? null,
        pageEnd: pageRange?.[1] ?? null,
        quote,
        color,
        note,
        paraIndex: item.index,
        paraStart: item.start,
        paraEnd: item.end,
      };
    },
    [paragraphs, pageTexts],
  );

  const highlight = useCallback(
    async (color: AnnotationColor) => {
      if (!selectionToolbar) return;
      for (const item of selectionToolbar.items) {
        await onCreate(anchorFor(item, color, null));
      }
      window.getSelection()?.removeAllRanges();
      setSelectionToolbar(null);
    },
    [selectionToolbar, anchorFor, onCreate],
  );

  const addNote = useCallback(async () => {
    if (!selectionToolbar) return;
    const item = selectionToolbar.items[0];
    const created = await onCreate(anchorFor(item, 'yellow', null));
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(null);
    if (!created) return;
    const article = articleRef.current;
    const marks = article?.querySelectorAll('mark');
    let rect: DOMRect | null = null;
    for (const mark of marks ?? []) {
      if (mark.textContent === item.quote) {
        rect = mark.getBoundingClientRect();
        break;
      }
    }
    setActivePopup({
      annotation: created,
      x: rect ? rect.left : window.innerWidth / 2 - 140,
      y: rect ? rect.bottom + 8 : window.innerHeight / 2,
    });
  }, [selectionToolbar, anchorFor, onCreate]);

  return (
    <div className="bg-background fixed inset-0" onMouseMove={reveal}>
      {error ? (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
          <p>Could not extract text from this document.</p>
          <pre className="text-muted-foreground max-w-[80%] text-xs whitespace-pre-wrap">{error}</pre>
          <Button onClick={onClose}>Back</Button>
        </div>
      ) : paragraphs.length === 0 ? (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin" aria-label="Loading" />
        </div>
      ) : (
        <div
          className={`bg-reflow absolute inset-y-0 left-0 flex justify-center overflow-y-auto overflow-x-hidden px-4 py-10${positioned ? '' : ' invisible'}`}
          style={{ right: notesSidebar.pageInset }}
          ref={scrollRef}
          onScroll={handleScroll}
          onClick={handleClick}
        >
          <ReflowArticle
            articleRef={articleRef}
            sections={pageSections}
            zoom={zoom}
            baseSize={baseSize}
            fileHash={file.hash}
            annotationsByPara={annotationsByPara}
            getImageData={getImageData}
            onOpenAnnotation={setActivePopup}
            onMouseUp={handleMouseUp}
          />
        </div>
      )}
      {paragraphs.length > 0 && !positioned && (
        <div className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin" aria-label="Loading" />
        </div>
      )}
      {selectionToolbar && (
        <SelectionToolbar
          x={selectionToolbar.x}
          y={selectionToolbar.y}
          onHighlight={highlight}
          onAddNote={addNote}
        />
      )}
      {activePopup && (
        <AnnotationPopup
          annotation={activePopup.annotation}
          x={activePopup.x}
          y={activePopup.y}
          onSaveNote={(note) => void onSetNote(activePopup.annotation.id, note)}
          onDelete={() => {
            void onDelete(activePopup.annotation.id);
            setActivePopup(null);
          }}
          onClose={() => setActivePopup(null)}
        />
      )}
      {!error && (
        <ReaderBars
          search={search}
          indexing={null}
          goToRequest={goToRequest}
          totalPages={pdf?.numPages ?? 0}
          currentPage={currentPage}
          onGoToPage={scrollToPage}
          onCloseGoTo={onCloseGoTo}
        />
      )}
      {!error && (
        <Overlay
          visible={overlayVisible}
          title={file.title}
          page={currentPage}
          total={pdf?.numPages ?? pageSections.length}
          mode="reflow"
          zoom={zoom}
          fitWidth={false}
          fullScreen={fullScreen}
          onFitWidth={() => {}}
          onToggleFullScreen={toggleFullScreen}
          onZoomChange={onZoomChange}
          onToggleMode={onToggleMode}
          onClose={onClose}
          onSeek={scrollToPage}
          onOpenGoTo={onOpenGoTo}
          onInteract={reveal}
          sidebarTab={sidebarTab}
          onSelectSidebarTab={setSidebarTab}
          sidebarThumbnailsEnabled={false}
          notesOpen={notesSidebar.open}
          onToggleNotes={notesSidebar.toggle}
        />
      )}
      {sidebarTab !== null && (
        <SidebarPanel
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          onClose={() => setSidebarTab(null)}
          showThumbnails={false}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        >
          <OutlineView
            nodes={outlineNodes}
            loading={outlineLoading}
            currentPage={currentPage}
            onSelect={scrollToPage}
          />
        </SidebarPanel>
      )}
      {notesSidebar.open && (
        <NotesSidebar
          notes={notesSidebar.notes}
          showHighlights={notesSidebar.showHighlights}
          onShowHighlightsChange={notesSidebar.onShowHighlightsChange}
          onClose={notesSidebar.close}
          width={notesSidebar.width}
          onWidthChange={notesSidebar.onWidthChange}
        />
      )}
    </div>
  );
}

/**
 * The whole document as page sections. Memoized so that state that changes
 * while reading (scroll position, overlay, selection toolbar, note popup) does
 * not re-reconcile every paragraph: only zoom, new text or highlight changes do.
 */
const ReflowArticle = memo(function ReflowArticle({
  articleRef,
  sections,
  zoom,
  baseSize,
  fileHash,
  annotationsByPara,
  getImageData,
  onOpenAnnotation,
  onMouseUp,
}: {
  articleRef: RefObject<HTMLElement | null>;
  sections: FlowItem[][];
  zoom: number;
  baseSize: number;
  fileHash: string;
  annotationsByPara: Map<number, Annotation[]>;
  getImageData: (pageIndex: number, ref: string) => Promise<unknown>;
  onOpenAnnotation: (entry: { annotation: Annotation; x: number; y: number }) => void;
  onMouseUp: () => void;
}) {
  return (
    <article
      ref={articleRef}
      className="text-foreground font-reflow w-full max-w-full leading-[1.65]"
      style={{ fontSize: baseSize * zoom }}
      onMouseUp={onMouseUp}
    >
      {sections.map((items, pageIndex) => (
        <section key={pageIndex} data-reflow-page={pageIndex}>
          {items.map((item) => (
            // A pdf.js ref can be painted on several pages (shared logos, rules), so
            // the ref alone is not unique across the flow.
            <Fragment key={item.kind === 'image' ? `image-${item.image.pageIndex}-${item.image.ref}` : `para-${item.index}`}>
              {item.kind === 'image' ? (
                <ReflowFigure image={item.image} zoom={zoom} fileHash={fileHash} getImageData={getImageData} />
              ) : (
                <Paragraph
                  paragraph={item.para}
                  zoom={zoom}
                  marks={annotationsByPara.get(item.index) ?? EMPTY_MARKS}
                  onOpen={onOpenAnnotation}
                />
              )}
            </Fragment>
          ))}
          <PageSeparator page={pageIndex + 1} />
        </section>
      ))}
    </article>
  );
});

/**
 * Renders one reflow paragraph, splitting it around the highlights that
 * intersect it. Overlapping highlights render in order and clip at the
 * paragraph bounds; plain runs stay as raw text so selection keeps working.
 * Memoized: with the whole document rendered at once, scroll-driven re-renders
 * must skip untouched paragraphs.
 */
const Paragraph = memo(function Paragraph({
  paragraph,
  zoom,
  marks,
  onOpen,
}: {
  paragraph: ReflowParagraph;
  zoom: number;
  marks: Annotation[];
  onOpen: (entry: { annotation: Annotation; x: number; y: number }) => void;
}) {
  const offsets = useMemo(() => runOffsets(paragraph), [paragraph]);

  // Renders the `[from, to)` slice of the paragraph, wrapping the highlights
  // that intersect it. A highlight crossing `to` is clipped there and resumes
  // in the next slice, which is how a contents entry splits title from page.
  const renderRange = (from: number, to: number): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let cursor = from;
    for (const mark of marks) {
      const start = Math.max(cursor, mark.paraStart!);
      const end = Math.min(to, mark.paraEnd!);
      if (end <= start) continue;
      if (start > cursor) nodes.push(...renderStyled(paragraph, offsets, cursor, start));
      nodes.push(
        <mark
          key={mark.id}
          className="cursor-pointer rounded-[2px]"
          style={{ backgroundColor: HIGHLIGHT_FILL[mark.color], padding: '0 1px' }}
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onOpen({ annotation: mark, x: rect.left, y: rect.bottom + 8 });
          }}
          title={mark.note ?? undefined}
        >
          {renderStyled(paragraph, offsets, start, end)}
        </mark>,
      );
      cursor = end;
    }
    if (cursor < to) nodes.push(...renderStyled(paragraph, offsets, cursor, to));
    return nodes;
  };

  if (paragraph.contents) {
    return (
      <ContentsEntry
        fontSize={paragraph.fontSize * zoom}
        level={paragraph.contents.level}
        title={renderRange(0, paragraph.contents.pageStart)}
        page={renderRange(paragraph.contents.pageStart, paragraph.text.length)}
      />
    );
  }

  return (
    <p
      className="mb-[1em]"
      style={{
        fontSize: paragraph.fontSize * zoom,
        // Table rows keep their original small size and never wrap: each row
        // scrolls horizontally instead of reflowing, so columns stay on one
        // line and body-text upscaling can't break the table layout.
        textAlign: getParagraphTextAlign(paragraph),
        textIndent: paragraph.isTable ? undefined : paragraph.indent ? '1.6em' : undefined,
        whiteSpace: paragraph.isTable ? 'nowrap' : undefined,
        overflowX: paragraph.isTable ? 'auto' : undefined,
        maxWidth: paragraph.isTable ? '100%' : undefined,
        fontVariantNumeric: paragraph.isTable ? 'tabular-nums' : undefined,
      }}
    >
      {renderRange(0, paragraph.text.length)}
    </p>
  );
});

/**
 * One table-of-contents entry laid out like the PDF page: the title on the
 * left, a dotted leader filling the gap, and the page number right-aligned.
 * The leader is a text-free element, so it never shifts the paragraph's text
 * offsets that highlights and selections are anchored to.
 */
function ContentsEntry({
  fontSize,
  level,
  title,
  page,
}: {
  fontSize: number;
  level: number;
  title: ReactNode;
  page: ReactNode;
}) {
  return (
    <p
      className="mb-[0.4em] flex items-baseline"
      style={{ fontSize, paddingLeft: `${level * CONTENTS_INDENT_EM}em` }}
    >
      <span className="min-w-0">{title}</span>
      <span
        aria-hidden
        className="mx-[0.4em] self-end border-b-2 border-dotted"
        style={{
          flex: '1 1 0',
          minWidth: `${CONTENTS_LEADER_MIN_EM}em`,
          borderColor: 'currentColor',
          opacity: CONTENTS_LEADER_OPACITY,
          marginBottom: '0.3em',
        }}
      />
      <span className="whitespace-nowrap tabular-nums">{page}</span>
    </p>
  );
}

/** Offsets into `paragraph.text` per run, so runs and highlight anchors (also text offsets) slice against each other. */
function runOffsets(paragraph: ReflowParagraph): Array<{ run: ReflowRun; start: number; end: number }> {
  let acc = 0;
  return paragraph.runs.map((run) => {
    const span = { run, start: acc, end: acc + run.text.length };
    acc += run.text.length;
    return span;
  });
}

/**
 * Renders the `[from, to)` char range of a paragraph as its styled runs.
 * Unstyled runs render as raw text so selection stays contiguous; bold/italic
 * runs are wrapped in spans with the matching weight and slant. Offsets come
 * from the same `paragraph.text` space the highlight anchors use, so runs and
 * marks slice cleanly against each other.
 */
function renderStyled(
  paragraph: ReflowParagraph,
  offsets: Array<{ run: ReflowRun; start: number; end: number }>,
  from: number,
  to: number,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  for (const { run, start, end } of offsets) {
    const s = Math.max(from, start);
    const e = Math.min(to, end);
    if (e <= s) continue;
    const chunk = run.text.slice(s - start, e - start);
    if (run.bold || run.italic) {
      nodes.push(
        <span
          key={`${from}-${start}`}
          style={{
            fontWeight: run.bold ? 'bold' : undefined,
            fontStyle: run.italic ? 'italic' : undefined,
          }}
        >
          {chunk}
        </span>,
      );
    } else {
      nodes.push(chunk);
    }
  }
  return nodes;
}

const EMPTY_MARKS: Annotation[] = [];

/**
 * Full-width rule with a small page number marking the end of a page in reflow
 * text. The number is drawn by CSS (`content: attr(data-page)`) rather than
 * rendered as a text node, so it stays out of copied text and out of the text
 * offsets that selections and highlights are computed from.
 */
function PageSeparator({ page }: { page: number }) {
  return (
    <div className="flex w-full items-center justify-center gap-4 py-8 select-none" aria-hidden>
      <span className="bg-border h-px flex-1" />
      <span
        data-page={page}
        className="text-muted-foreground text-xs font-medium tabular-nums px-1 after:content-[attr(data-page)]"
      />
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

/** Measured vertical extent of the page sections, in scroll-content pixels. */
interface PageEdges {
  /** Top of each page section; `offsets[i]` is page `i + 1`. */
  offsets: number[];
  /** Bottom of the last page section. */
  end: number;
}

const NO_PAGE_EDGES: PageEdges = { offsets: [], end: 0 };

function measurePageEdges(container: HTMLElement, article: HTMLElement): PageEdges {
  const containerTop = container.getBoundingClientRect().top - container.scrollTop;
  const sections = article.querySelectorAll<HTMLElement>(':scope > section');
  const offsets: number[] = [];
  let end = 0;
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    offsets.push(rect.top - containerTop);
    end = rect.bottom - containerTop;
  }
  return { offsets, end };
}

/** Sub-pixel jitter between measurements must not trigger a re-render loop. */
function samePageEdges(a: PageEdges, b: PageEdges): boolean {
  if (a.offsets.length !== b.offsets.length || Math.abs(a.end - b.end) > 0.5) return false;
  return a.offsets.every((offset, i) => Math.abs(offset - b.offsets[i]) <= 0.5);
}

/** Maps global text offsets over the article back to per-paragraph ranges. */
function selectionToParagraphs(
  article: HTMLElement,
  globalStart: number,
  globalEnd: number,
): ReflowSelection[] {
  const paras = Array.from(article.querySelectorAll<HTMLElement>('p'));
  const out: ReflowSelection[] = [];
  let acc = 0;
  for (let i = 0; i < paras.length; i++) {
    const length = paras[i].textContent?.length ?? 0;
    const start = Math.max(globalStart, acc);
    const end = Math.min(globalEnd, acc + length);
    if (start < end) {
      const quote = (paras[i].textContent ?? '').slice(start - acc, end - acc);
      if (quote.trim().length > 0) out.push({ index: i, start: start - acc, end: end - acc, quote });
    }
    acc += length;
    if (acc >= globalEnd) break;
  }
  return out;
}