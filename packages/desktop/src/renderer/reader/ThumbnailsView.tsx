import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { cn } from '@/lib/utils';
import { getPageCached } from './pdf';

/** CSS width of each thumbnail in pixels; height follows the page aspect ratio. */
const THUMB_WIDTH = 148;

interface ThumbnailsViewProps {
  pdf: PDFDocumentProxy;
  total: number;
  currentPage: number;
  onSelect: (page: number) => void;
}

/**
 * Lazy page thumbnails: each page renders a small canvas only once it scrolls
 * near the viewport, so large documents don't pay N worker round-trips up
 * front. Clicking a thumbnail jumps the main view to that page.
 */
export function ThumbnailsView({ pdf, total, currentPage, onSelect }: ThumbnailsViewProps) {
  return (
    <div className="min-h-0 flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" role="list" aria-label="Page thumbnails">
      {Array.from({ length: total }, (_, i) => (
        <ThumbnailItem
          key={i + 1}
          pdf={pdf}
          pageNumber={i + 1}
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
  active,
  onSelect,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onSelect: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    const canvas = canvasRef.current;
    if (!holder || !canvas) return;
    let cancelled = false;
    let observed = true;

    const render = async () => {
      try {
        if (pdf.loadingTask.destroyed) return;
        const page = await getPageCached(pdf, pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale = THUMB_WIDTH / viewport.width;
        const scaled = page.getViewport({ scale });
        canvas.width = Math.ceil(scaled.width);
        canvas.height = Math.ceil(scaled.height);
        await page.render({ canvas, viewport: scaled }).promise;
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
    };
  }, [pdf, pageNumber]);

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
        <span className="bg-muted text-muted-foreground flex items-center justify-center text-xs" style={{ width: THUMB_WIDTH, height: THUMB_WIDTH * 1.3 }}>
          {pageNumber}
        </span>
      ) : (
        <canvas
          ref={canvasRef}
          className={cn(
            'block rounded-[2px] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]',
            active && 'ring-primary ring-2',
          )}
          style={{ width: THUMB_WIDTH }}
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
