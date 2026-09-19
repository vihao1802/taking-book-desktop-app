import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { stepZoomMultiplier, type PositionedReflowImage, type ReflowParagraph, type ReflowRun } from '@taking-book/core';
import type { Annotation, AnnotationColor, BookFile, CreateAnnotationInput } from '../../shared/types';
import type { ReflowProgress } from './useReflowDocument';
import { Button } from '@/components/ui/button';
import { Overlay } from './Overlay';
import { SidebarPanel, type SidebarTab } from './SidebarPanel';
import { OutlineView } from './OutlineView';
import { usePdfOutline } from './usePdfOutline';
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
import { useReaderShortcuts } from './useReaderShortcuts';

const HIDE_DELAY_MS = 2500;
/** Keyboard paging: fraction of the viewport a screen step scrolls, and a line step in px. */
const SCREEN_STEP_RATIO = 0.9;
const LINE_STEP_PX = 48;
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
  initialFraction?: number;
  onScrollFraction?: (fraction: number) => void;
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
  initialFraction,
  onScrollFraction,
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
  getImageData,
}: ReflowReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const restoredRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ items: ReflowSelection[]; x: number; y: number } | null>(null);
  const [activePopup, setActivePopup] = useState<{ annotation: Annotation; x: number; y: number } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null);
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

  const total = paragraphs.length;
  const el = scrollRef.current;
  const scrollable = Math.max((el?.scrollHeight ?? 0) - (el?.clientHeight ?? 0), 0);
  const currentIndex = Math.min(
    Math.max(Math.round((scrollTop / Math.max(scrollable, 1)) * Math.max(total - 1, 0)), 0),
    Math.max(total - 1, 0),
  );
  const position = useRef({ page: 1, position: 0 });
  const saveTimerRef = useRef<number>(0);

  const onScrollFractionRef = useRef(onScrollFraction);
  onScrollFractionRef.current = onScrollFraction;

  const savePosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = Math.max(el.scrollHeight - el.clientHeight, 0);
    const frac = scrollable > 0 ? el.scrollTop / scrollable : 0;
    position.current = { page: 1, position: frac };
    onScrollFractionRef.current?.(frac);
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      window.api.saveLastPosition(file.id, 1, position.current.position, 'reflow');
    }, 400);
  }, [file.id]);

  useEffect(() => {
    const saveNow = () => {
      window.clearTimeout(saveTimerRef.current);
      window.api.saveLastPosition(file.id, 1, position.current.position, 'reflow');
    };
    window.addEventListener('beforeunload', saveNow);
    return () => {
      window.removeEventListener('beforeunload', saveNow);
      saveNow();
    };
  }, [file.id]);

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

  const seekToParagraph = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el || total === 0) return;
      const scrollable = Math.max(el.scrollHeight - el.clientHeight, 0);
      const target = (index / Math.max(total - 1, 1)) * scrollable;
      el.scrollTo({ top: target, behavior: 'smooth' });
    },
    [total],
  );

  // Outlines resolve to PDF pages; reflow jumps to the first paragraph
  // extracted from that page.
  const selectOutlinePage = useCallback(
    (page: number) => {
      const index = paragraphs.findIndex((para) => para.pageIndex === page - 1);
      seekToParagraph(index === -1 ? 0 : index);
    },
    [paragraphs, seekToParagraph],
  );

  // Scroll updates are coalesced to one state write per frame; a raw setState
  // per scroll event re-rendered the whole article on every tick.
  const handleScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      savePosition();
    });
  }, [savePosition]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Restoring the saved fraction needs the final article height, so wait
  // until extraction is complete rather than trusting a partial render.
  useEffect(() => {
    if (progress !== null) return;
    if (restoredRef.current || paragraphs.length === 0 || initialFraction === undefined) return;
    const el = scrollRef.current;
    if (!el || el.scrollHeight === 0) return;
    restoredRef.current = true;
    const scrollable = Math.max(el.scrollHeight - el.clientHeight, 0);
    el.scrollTop = initialFraction * scrollable;
    setScrollTop(el.scrollTop);
  }, [progress, paragraphs.length, initialFraction]);

  const scrollReflow = useCallback((targetFor: (el: HTMLDivElement) => number) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: targetFor(el), behavior: 'smooth' });
  }, []);

  const clearSelectionUi = () => {
    setSelectionToolbar(null);
    setActivePopup(null);
  };

  // Escape peels off one layer at a time: selection toolbar / note popup, find
  // bar, go-to bar, sidebar, then the reader itself.
  const dismiss = () => {
    if (selectionToolbar || activePopup) clearSelectionUi();
    else if (search.open) search.close();
    else if (goToRequest !== 0) onCloseGoTo();
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

  const comment = useCallback(async () => {
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
          <p>
            {progress
              ? `Extracting page ${progress.done} of ${progress.total}…`
              : 'Reflowing…'}
          </p>
        </div>
      ) : (
        <div
          className="absolute inset-0 flex justify-center overflow-y-auto overflow-x-hidden px-4 py-10"
          ref={scrollRef}
          onScroll={handleScroll}
          onClick={handleClick}
        >
          <article
            ref={articleRef}
            className="text-foreground w-full max-w-full leading-[1.65]"
            style={{ fontSize: baseSize * zoom }}
            onMouseUp={handleMouseUp}
          >
            {flowItems.map((item, i) => {
              const isEndOfPage =
                i === flowItems.length - 1 || flowItemPage(item) !== flowItemPage(flowItems[i + 1]);
              // A pdf.js ref can be painted on several pages (shared logos, rules), so
              // the ref alone is not unique across the flow.
              const key =
                item.kind === 'image'
                  ? `image-${item.image.pageIndex}-${item.image.ref}`
                  : `para-${item.index}`;
              return (
                <Fragment key={key}>
                  {item.kind === 'image' ? (
                    <ReflowFigure
                      image={item.image}
                      zoom={zoom}
                      fileHash={file.hash}
                      getImageData={getImageData}
                    />
                  ) : (
                    <Paragraph
                      paragraph={item.para}
                      zoom={zoom}
                      marks={annotationsByPara.get(item.index) ?? EMPTY_MARKS}
                      onOpen={setActivePopup}
                    />
                  )}
                  {isEndOfPage && <PageSeparator page={flowItemPage(item) + 1} />}
                </Fragment>
              );
            })}
          </article>
        </div>
      )}
      {selectionToolbar && (
        <SelectionToolbar
          x={selectionToolbar.x}
          y={selectionToolbar.y}
          onHighlight={highlight}
          onComment={comment}
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
          currentPage={(paragraphs[currentIndex]?.pageIndex ?? 0) + 1}
          onGoToPage={selectOutlinePage}
          onCloseGoTo={onCloseGoTo}
        />
      )}
      {!error && (
        <Overlay
          visible={overlayVisible}
          title={`${file.title} — reflow`}
          page={currentIndex + 1}
          total={total}
          mode="reflow"
          zoom={zoom}
          fitWidth={false}
          onFitWidth={() => {}}
          onZoomChange={onZoomChange}
          onToggleMode={onToggleMode}
          onClose={onClose}
          onSeek={(n) => seekToParagraph(n - 1)}
          onInteract={reveal}
          sidebarTab={sidebarTab}
          onSelectSidebarTab={setSidebarTab}
          sidebarThumbnailsEnabled={false}
        />
      )}
      {sidebarTab !== null && (
        <SidebarPanel
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          onClose={() => setSidebarTab(null)}
          showThumbnails={false}
        >
          <OutlineView
            nodes={outlineNodes}
            loading={outlineLoading}
            currentPage={(paragraphs[currentIndex]?.pageIndex ?? 0) + 1}
            onSelect={selectOutlinePage}
          />
        </SidebarPanel>
      )}
    </div>
  );
}

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
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const mark of marks) {
    const start = Math.max(cursor, mark.paraStart!);
    const end = Math.min(paragraph.text.length, mark.paraEnd!);
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
  if (cursor < paragraph.text.length) nodes.push(...renderStyled(paragraph, offsets, cursor, paragraph.text.length));

  return (
    <p
      className="mb-[1em]"
      style={{
        fontSize: paragraph.fontSize * zoom,
        // Table rows keep their original small size and never wrap: each row
        // scrolls horizontally instead of reflowing, so columns stay on one
        // line and body-text upscaling can't break the table layout.
        textAlign: paragraph.isTable ? 'left' : (paragraph.align ?? 'justify'),
        textIndent: paragraph.isTable ? undefined : paragraph.indent ? '1.6em' : undefined,
        whiteSpace: paragraph.isTable ? 'nowrap' : undefined,
        overflowX: paragraph.isTable ? 'auto' : undefined,
        maxWidth: paragraph.isTable ? '100%' : undefined,
        fontVariantNumeric: paragraph.isTable ? 'tabular-nums' : undefined,
      }}
    >
      {nodes}
    </p>
  );
});

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

/** Full-width rule with a small page number marking the end of a page in reflow text. */
function PageSeparator({ page }: { page: number }) {
  return (
    <div className="flex w-full items-center justify-center gap-4 py-8 select-none" aria-hidden>
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs font-medium tabular-nums px-1">{page}</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
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