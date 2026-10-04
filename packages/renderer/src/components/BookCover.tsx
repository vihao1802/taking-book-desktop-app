import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Loader2 } from 'lucide-react';
import { isOk } from '@taking-book/core';
import * as pdfjs from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { BookFile } from '@/reader-api';
import { cn } from '@/lib/utils';
import { createCoverLoader, type CoverSource } from './cover-loader';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const COVER_MAX_WIDTH = 220;
const COVER_JPEG_QUALITY = 0.82;
// Enough to keep covers arriving steadily without holding many PDFs in memory at once.
const MAX_CONCURRENT_RENDERS = 3;
// Starts a cover shortly before its card scrolls into view, so it is usually ready on arrival.
const PRELOAD_MARGIN = '400px';

let sharedWorker: pdfjs.PDFWorker | null = null;

/** One pdf.js worker for every cover; without it each render starts its own worker thread. */
function getCoverWorker(): pdfjs.PDFWorker {
  sharedWorker ??= new pdfjs.PDFWorker();
  return sharedWorker;
}

/** Renders the first page of a PDF to a small JPEG data URL. */
async function renderCover(file: CoverSource): Promise<string> {
  const task = pdfjs.getDocument({
    url: window.api.getDocumentUrl(file.path),
    standardFontDataUrl: 'appfile://fonts/',
    wasmUrl: 'appfile://wasm/',
    worker: getCoverWorker(),
  });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(COVER_MAX_WIDTH / base.width, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context unavailable');
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL('image/jpeg', COVER_JPEG_QUALITY);
  } finally {
    // Destroying the document leaves the shared worker running for the next cover.
    await task.destroy();
  }
}

/**
 * Prefers the on-disk cache (rendered once, reused on later launches); only
 * when nothing is cached does it render the PDF's first page, then persists
 * the result so the next session loads it instantly.
 */
const coverLoader = createCoverLoader({
  readSaved: (hash) => window.api.getCoverData(hash),
  render: renderCover,
  save: async (hash, dataUrl) => {
    const result = await window.api.saveCoverData(hash, dataUrl);
    if (!isOk(result)) console.error(`Could not save the cover of ${hash}: ${result.error}`);
  },
  maxConcurrentRenders: MAX_CONCURRENT_RENDERS,
});

/** Whether the element has come within PRELOAD_MARGIN of the viewport; stays true once it has. */
function useNearViewport(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setNear(true);
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled, near]);
  return near;
}

export interface BookCoverProps {
  file: BookFile;
  className?: string;
  /** Shown while the cover loads and if rendering fails. */
  fallback: ReactNode;
}

/**
 * Shows the PDF's first page as its cover. Covers are decorative, so a failed
 * render only falls back to the placeholder; it never blocks the library.
 */
export function BookCover({ file, className, fallback }: BookCoverProps) {
  const [cover, setCover] = useState<string | null>(() => coverLoader.peek(file.hash));
  const [loading, setLoading] = useState(() => coverLoader.peek(file.hash) === null);
  const boxRef = useRef<HTMLDivElement>(null);
  const near = useNearViewport(boxRef, cover === null);

  useEffect(() => {
    if (cover || !near) return;
    setLoading(true);
    let cancelled = false;
    coverLoader
      .load(file)
      .then((dataUrl) => {
        if (!cancelled) {
          setCover(dataUrl);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoading(false);
          console.error(`Failed to load cover for "${file.title}"`, error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file, cover, near]);

  return (
    // The edge is translucent, so the caller's placeholder background is clipped
    // inside it; otherwise that color tints the edge instead of the shelf behind.
    <div
      ref={boxRef}
      className={cn(
        'border-cover-edge shadow-cover relative flex items-center justify-center overflow-hidden border bg-clip-padding',
        className,
      )}
    >
      {cover ? (
        <img src={cover} alt={`Cover of ${file.title}`} className="h-full w-full object-cover" />
      ) : (
        // Fill the whole cover box so the loading state never collapses to the
        // icon's size; the caller's className (e.g. aspect-2/3 + w-full) defines
        // the dimensions and this layer always fills them.
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          {loading ? (
            <Loader2
              className="size-8 animate-spin text-card opacity-80"
              aria-label={`Loading cover for ${file.title}`}
            />
          ) : (
            <span>{fallback}</span>
          )}
        </div>
      )}
    </div>
  );
}
