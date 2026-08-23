import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, AnnotationColor } from '../../shared/types';
import { pageFromOffset, type PageLayout } from './pdf';
import { PdfPageView, type PageTextSelection } from './PdfPageView';

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
  onScrollPosition: (page: number, position: number) => void;
  onCurrentPage: (page: number) => void;
  pageTexts: string[];
  annotations: Annotation[];
  onCreate: (
    selection: PageTextSelection,
    color: AnnotationColor,
    note: string | null,
  ) => Promise<Annotation | null>;
  onSetNote: (id: number, note: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export const PdfPages = forwardRef<PdfPagesHandle, PdfPagesProps>(function PdfPages(
  {
    pdf,
    layout,
    containerWidth,
    containerHeight,
    dpr,
    initialPosition,
    onScrollPosition,
    onCurrentPage,
    pageTexts,
    annotations,
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
    });
  }, [layout]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || restoredRef.current) return;
    restoredRef.current = true;
    const scrollable = Math.max(layout.totalHeight - el.clientHeight, 0);
    const target = Math.min(initialPosition, 1) * scrollable;
    el.scrollTop = target;
    setScrollTop(target);
  }, [layout, initialPosition]);

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

  const slots = [];
  for (let i = start; i < end; i++) {
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