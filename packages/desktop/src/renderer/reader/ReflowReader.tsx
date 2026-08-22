import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ReflowParagraph } from '@taking-book/core';
import type { Annotation, AnnotationColor, BookFile, CreateAnnotationInput } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { useTheme } from '../theme';
import { Overlay } from './Overlay';
import { AnnotationPopup } from './AnnotationPopup';
import { SelectionToolbar } from './SelectionToolbar';
import { findRangeIgnoringWhitespace, HIGHLIGHT_FILL, rangeGlobalOffsets, selectionRect } from './highlights';

const HIDE_DELAY_MS = 2500;

/** One contiguous stretch of selected text inside a single reflow paragraph. */
interface ReflowSelection {
  index: number;
  start: number;
  end: number;
  quote: string;
}

interface ReflowReaderProps {
  file: BookFile;
  paragraphs: ReflowParagraph[];
  pageTexts: string[];
  error: string | null;
  onClose: () => void;
  onToggleMode: () => void;
  initialFraction?: number;
  onScrollFraction?: (fraction: number) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  annotations: Annotation[];
  onCreate: (input: CreateAnnotationInput) => Promise<Annotation | null>;
  onSetNote: (id: number, note: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function ReflowReader({
  file,
  paragraphs,
  pageTexts,
  error,
  onClose,
  onToggleMode,
  initialFraction,
  onScrollFraction,
  zoom,
  onZoomChange,
  annotations,
  onCreate,
  onSetNote,
  onDelete,
}: ReflowReaderProps) {
  const { cycleTheme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const restoredRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<{ items: ReflowSelection[]; x: number; y: number } | null>(null);
  const [activePopup, setActivePopup] = useState<{ annotation: Annotation; x: number; y: number } | null>(null);
  const hideTimerRef = useRef<number>(0);
  const rafRef = useRef(0);

  // Body font size the zoom multiplier is relative to. Computed once per
  // document instead of per render (and without a spread that can blow the
  // argument limit on books with tens of thousands of paragraphs).
  const baseSize = useMemo(() => {
    let max = 0;
    for (const para of paragraphs) if (para.fontSize > max) max = para.fontSize;
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

  const startHideTimer = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setOverlayVisible(false), HIDE_DELAY_MS);
  }, []);

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

  useEffect(() => {
    if (restoredRef.current || paragraphs.length === 0 || initialFraction === undefined) return;
    const el = scrollRef.current;
    if (!el || el.scrollHeight === 0) return;
    restoredRef.current = true;
    const scrollable = Math.max(el.scrollHeight - el.clientHeight, 0);
    el.scrollTop = initialFraction * scrollable;
    setScrollTop(el.scrollTop);
  }, [paragraphs.length, initialFraction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectionToolbar(null);
        setActivePopup(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          <p>Reflowing…</p>
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
            className="text-foreground w-[min(68ch,100%)] max-w-full leading-[1.65]"
            style={{ fontSize: baseSize * zoom }}
            onMouseUp={handleMouseUp}
          >
            {paragraphs.map((para, i) => (
              <Paragraph
                key={i}
                paragraph={para}
                zoom={zoom}
                marks={annotationsByPara.get(i) ?? EMPTY_MARKS}
                onOpen={setActivePopup}
              />
            ))}
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
          onSeek={(n) => {
            const el = scrollRef.current;
            if (!el) return;
            const scrollable = Math.max(el.scrollHeight - el.clientHeight, 0);
            const target = ((n - 1) / Math.max(total - 1, 1)) * scrollable;
            el.scrollTo({ top: target, behavior: 'smooth' });
          }}
          onCycleTheme={cycleTheme}
        />
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
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const mark of marks) {
    const start = Math.max(cursor, mark.paraStart!);
    const end = Math.min(paragraph.text.length, mark.paraEnd!);
    if (end <= start) continue;
    if (start > cursor) nodes.push(paragraph.text.slice(cursor, start));
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
        {paragraph.text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < paragraph.text.length) nodes.push(paragraph.text.slice(cursor));

  return (
    <p
      className="mb-[1em] text-justify"
      style={{
        fontSize: paragraph.fontSize * zoom,
        textIndent: paragraph.indent ? '1.6em' : undefined,
      }}
    >
      {nodes}
    </p>
  );
});

const EMPTY_MARKS: Annotation[] = [];

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