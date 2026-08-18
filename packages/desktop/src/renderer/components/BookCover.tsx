import { useEffect, useState, type ReactNode } from 'react';
import * as pdfjs from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { BookFile } from '../../shared/types';
import { cn } from '@/lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const coverCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

const COVER_MAX_WIDTH = 220;
const COVER_JPEG_QUALITY = 0.82;

/** Renders the first page of a PDF to a small JPEG data URL. */
async function renderCover(file: BookFile): Promise<string> {
  const task = pdfjs.getDocument({
    url: `appfile://doc/${encodeURIComponent(file.path)}`,
    standardFontDataUrl: 'appfile://fonts/',
    wasmUrl: 'appfile://wasm/',
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
    await task.destroy();
  }
}

/** Returns a cached cover URL for a file, sharing one load across callers. */
function loadCover(file: BookFile): Promise<string> {
  const cached = coverCache.get(file.hash);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(file.hash);
  if (running) return running;
  const promise = renderCover(file)
    .then((dataUrl) => {
      coverCache.set(file.hash, dataUrl);
      inFlight.delete(file.hash);
      return dataUrl;
    })
    .catch((error: unknown) => {
      inFlight.delete(file.hash);
      throw error;
    });
  inFlight.set(file.hash, promise);
  return promise;
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
  const [cover, setCover] = useState<string | null>(() => coverCache.get(file.hash) ?? null);

  useEffect(() => {
    if (cover) return;
    let cancelled = false;
    loadCover(file)
      .then((dataUrl) => {
        if (!cancelled) setCover(dataUrl);
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error(`Failed to load cover for "${file.title}"`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [file, cover]);

  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden border-2 border-border', className)}>
      {cover ? (
        <img src={cover} alt={`Cover of ${file.title}`} className="h-full w-full object-cover" />
      ) : (
        fallback
      )}
    </div>
  );
}
