import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { pageFromOffset, type PageLayout } from './pdf';
import { PageCanvas } from './PageCanvas';

export interface PdfPagesHandle {
  scrollToPage: (page: number) => void;
}

interface PdfPagesProps {
  pdf: PDFDocumentProxy;
  layout: PageLayout;
  containerWidth: number;
  containerHeight: number;
  dpr: number;
  initialPosition: number;
  onScrollPosition: (page: number, position: number) => void;
  onCurrentPage: (page: number) => void;
}

export const PdfPages = forwardRef<PdfPagesHandle, PdfPagesProps>(function PdfPages(
  { pdf, layout, containerWidth, containerHeight, dpr, initialPosition, onScrollPosition, onCurrentPage },
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
        className="pdf-page-slot"
        style={{ top: layout.offsets[i], width: containerWidth, height: layout.heights[i] }}
      >
        <PageCanvas pdf={pdf} pageNumber={i + 1} cssScale={layout.scales[i]} dpr={dpr} />
      </div>,
    );
  }

  return (
    <div className="pdf-scroll" ref={scrollRef} onScroll={handleScroll}>
      <div className="pdf-pages" style={{ height: layout.totalHeight }}>
        {slots}
      </div>
    </div>
  );
});
