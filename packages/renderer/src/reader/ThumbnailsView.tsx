import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { cn } from '@/lib/utils';
import { getPageCached } from './pdf';

/**
 * How long the thumbnail width must hold still before canvases are re-rendered
 * at it. Dragging the sidebar changes the width every frame, and re-rendering
 * bitmaps per frame would flood the pdf.js worker.
 */
const RENDER_SETTLE_MS = 150;

/** Height/width ratio used until the first page's real size is known. */
const DEFAULT_ASPECT = 1.3;

interface ThumbnailsViewProps {
  pdf: PDFDocumentProxy;
  total: number;
  currentPage: number;
  /** CSS width of each thumbnail in pixels; height follows the page aspect ratio. */
  thumbWidth: number;
  onSelect: (page: number) => void;
}

/**
 * Lazy page thumbnails: each page renders a small canvas only once it scrolls
 * near the viewport, so large documents don't pay N worker round-trips up
 * front. Clicking a thumbnail jumps the main view to that page.
 */
export function ThumbnailsView({ pdf, total, currentPage, thumbWidth, onSelect }: ThumbnailsViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);
  const [placeholderAspect, setPlaceholderAspect] = useState<number | null>(null);
  const [renderWidth, setRenderWidth] = useState(thumbWidth);

  // Canvases keep displaying their current bitmap, scaled by CSS, while the
  // width is changing and only re-render once it has settled.
  useEffect(() => {
    const timer = window.setTimeout(() => setRenderWidth(thumbWidth), RENDER_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [thumbWidth]);

  // Thumbnails that haven't rendered yet reserve the first page's aspect
  // ratio, so their height is already right when the list first lays out.
  // Without this every unrendered thumbnail is a few pixels tall and the list
  // reflows as canvases fill in, leaving the active page scrolled out of view.
  useEffect(() => {
    let cancelled = false;
    getPageCached(pdf, 1)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        setPlaceholderAspect(viewport.height / viewport.width);
      })
      .catch((err: unknown) => {
        if (cancelled || pdf.loadingTask.destroyed) return;
        console.error('Failed to measure first page for thumbnail placeholders', err);
        setPlaceholderAspect(DEFAULT_ASPECT);
      });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // Bring the active thumbnail into view: instantly and centered when the
  // sidebar opens, then smoothly as the reader scrolls so the selection never
  // drifts out of sight while scrubbing through the document.
  const ready = placeholderAspect !== null;
  useEffect(() => {
    if (!ready) return;
    const active = listRef.current?.querySelector('[aria-current="true"]');
    if (!active) return;
    const initial = !hasScrolledRef.current;
    hasScrolledRef.current = true;
    active.scrollIntoView(
      initial ? { block: 'center', behavior: 'instant' } : { block: 'nearest', behavior: 'smooth' },
    );
  }, [currentPage, ready]);

  return (
    <div
      ref={listRef}
      className="min-h-0 flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
      role="list"
      aria-label="Page thumbnails"
    >
      {ready &&
        Array.from({ length: total }, (_, i) => (
          <ThumbnailItem
            key={i + 1}
            pdf={pdf}
            pageNumber={i + 1}
            placeholderAspect={placeholderAspect}
            thumbWidth={thumbWidth}
            renderWidth={renderWidth}
            active={i + 1 === currentPage}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function ThumbnailItem({
  pdf,
  pageNumber,
  placeholderAspect,
  thumbWidth,
  renderWidth,
  active,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  placeholderAspect: number;
  thumbWidth: number;
  renderWidth: number;
  active: boolean;
  onSelect: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  const [renderedAspect, setRenderedAspect] = useState<number | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    const canvas = canvasRef.current;
    if (!holder || !canvas) return;
    let cancelled = false;
    let observed = true;
    // A pending render must be cancelled when the width changes: pdf.js
    // rejects a second render() on a canvas that is still being drawn.
    let renderTask: RenderTask | null = null;

    const render = async () => {
      try {
        if (pdf.loadingTask.destroyed) return;
        const page = await getPageCached(pdf, pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = renderWidth / viewport.width;
        const scaled = page.getViewport({ scale });
        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        renderTask = page.render({ canvas, viewport: scaled });
        await renderTask.promise;
        if (!cancelled) setRenderedAspect(scaled.height / scaled.width);
      } catch (err) {
        if (cancelled || pdf.loadingTask.destroyed) return;
        console.error(`Failed to render thumbnail for page ${pageNumber}`, err);
        setFailed(true);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && observed) {
          observed = false;
          observer.disconnect();
          void render();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(holder);
    return () => {
      cancelled = true;
      observer.disconnect();
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, renderWidth]);

  const thumbHeight = thumbWidth * (renderedAspect ?? placeholderAspect);

  return (
    <button
      ref={holderRef}
      type="button"
      role="listitem"
      onClick={() => onSelect(pageNumber)}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group flex shrink-0 flex-col items-center gap-1.5 rounded-md p-1.5 outline-none',
        'focus-visible:ring-ring/50 focus-visible:ring-2',
        active ? 'bg-accent' : 'hover:bg-accent/60',
      )}
    >
      {failed ? (
        <span className="bg-muted text-muted-foreground flex items-center justify-center text-xs" style={{ width: thumbWidth, height: thumbHeight }}>
          {pageNumber}
        </span>
      ) : (
        <canvas
          ref={canvasRef}
          className={cn(
            'block rounded-[2px] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]',
            active && 'ring-primary ring-2',
          )}
          style={{ width: thumbWidth, height: thumbHeight }}
        />
      )}
      <span
        className={cn(
          'text-xs tabular-nums',
          active ? 'text-foreground font-medium' : 'text-muted-foreground',
        )}
      >
        {pageNumber}
      </span>
    </button>
  );
}
