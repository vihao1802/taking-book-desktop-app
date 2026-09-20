import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { pageIndexAtOffset } from '@taking-book/core';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const PAGE_GAP = 12;

let cachedScrollbarWidth: number | null = null;

/**
 * Width of a classic (non-overlay) vertical scrollbar in CSS pixels.
 *
 * The reader's scroll container reserves this much horizontal space for its
 * vertical scrollbar, so a page laid out to the full measured container width
 * would overflow by this amount and trigger an unwanted horizontal scrollbar.
 * Measured once; returns 0 on platforms with overlay scrollbars.
 */
export function getScrollbarWidth(): number {
  if (cachedScrollbarWidth !== null) return cachedScrollbarWidth;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;';
  document.body.appendChild(probe);
  cachedScrollbarWidth = Math.max(probe.offsetWidth - probe.clientWidth, 0);
  probe.remove();
  return cachedScrollbarWidth;
}

export function fileUrl(filePath: string): string {
  return `appfile://doc/${encodeURIComponent(filePath)}`;
}

export function usePdfDocument(url: string | null) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const task = pdfjs.getDocument({
      url,
      standardFontDataUrl: 'appfile://fonts/',
      wasmUrl: 'appfile://wasm/',
    });
    task.promise
      .then((doc) => {
        if (!cancelled) setPdf(doc);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
      // Drop the loaded document from state before destroying it: a pdf.js
      // proxy becomes unusable the moment its loading task is destroyed, so
      // holding onto it past teardown lets a still-mounted reader call
      // `getPage` on a dead document (its worker message handler is null).
      setPdf(null);
      setError(null);
      task.destroy();
    };
  }, [url]);

  return { pdf, error };
}

export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [node, setNode] = useState<T | null>(null);

  useEffect(() => {
    setNode(ref.current);
  });

  useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(node);
    setSize({ width: node.clientWidth, height: node.clientHeight });
    return () => ro.disconnect();
  }, [node]);

  return size;
}

export interface PageLayout {
  heights: number[];
  offsets: number[];
  scales: number[];
  totalHeight: number;
  /** True once every page's real dimensions have been measured. */
  complete: boolean;
}

/**
 * Shares one in-flight `getPage` promise per page across layout, canvas, and
 * text-layer callers. Without this each visible page costs 2-3 worker
 * round-trips (layout + canvas render + text layer each fetch independently).
 * Entries are dropped when the document is destroyed.
 */
const pagePromiseCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PDFPageProxy>>>();

export function getPageCached(pdf: PDFDocumentProxy, pageNumber: number): Promise<PDFPageProxy> {
  let perDoc = pagePromiseCache.get(pdf);
  if (!perDoc) {
    perDoc = new Map();
    pagePromiseCache.set(pdf, perDoc);
  }
  const cached = perDoc.get(pageNumber);
  if (cached) return cached;
  const promise = pdf.getPage(pageNumber);
  perDoc.set(pageNumber, promise);
  // A rejected fetch (e.g. teardown race) must not poison later callers.
  promise.catch(() => {
    if (perDoc.get(pageNumber) === promise) perDoc.delete(pageNumber);
  });
  return promise;
}

/** Fallback page size (US Letter points) used before a page is measured. */
const FALLBACK_PAGE = { width: 612, height: 792 };

/** Pages fetched concurrently while measuring the document. */
const LAYOUT_CONCURRENCY = 6;

/** Flush measured sizes to state this often; every page would re-render 600+ times. */
const LAYOUT_FLUSH_EVERY = 10;

export function usePageLayout(pdf: PDFDocumentProxy | null, containerWidth: number): PageLayout | null {
  const [baseViewports, setBaseViewports] = useState<({ width: number; height: number } | null)[] | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!pdf) {
      setBaseViewports(null);
      setComplete(false);
      return;
    }
    let cancelled = false;
    const total = pdf.numPages;
    const vps: ({ width: number; height: number } | null)[] = new Array(total).fill(null);
    let done = 0;
    const flush = () => {
      if (!cancelled) setBaseViewports([...vps]);
    };
    (async () => {
      // Measure page 1 first so the reader can paint immediately; the rest
      // fills in behind it instead of blocking first paint on all N pages.
      try {
        const first = await getPageCached(pdf, 1);
        if (cancelled) return;
        const vp = first.getViewport({ scale: 1 });
        vps[0] = { width: vp.width, height: vp.height };
        done = 1;
        flush();
      } catch {
        if (!cancelled) setBaseViewports(null);
        return;
      }
      // Measure the remaining pages with bounded concurrency.
      let next = 2;
      const workers: Promise<void>[] = [];
      const workerCount = Math.min(LAYOUT_CONCURRENCY, Math.max(total - 1, 0));
      for (let w = 0; w < workerCount; w++) {
        workers.push(
          (async () => {
            while (!cancelled) {
              const pageNumber = next++;
              if (pageNumber > total) return;
              try {
                const page = await getPageCached(pdf, pageNumber);
                if (cancelled) return;
                const vp = page.getViewport({ scale: 1 });
                vps[pageNumber - 1] = { width: vp.width, height: vp.height };
              } catch {
                // A single unreadable page keeps its fallback size; it must
                // not abort measurement of the rest of the document.
                if (cancelled) return;
              }
              done++;
              if (done % LAYOUT_FLUSH_EVERY === 0 || done === total) flush();
            }
          })(),
        );
      }
      await Promise.all(workers);
      if (!cancelled) {
        flush();
        setComplete(true);
      }
    })().catch(() => {
      // The document was torn down mid-iteration (e.g. the reader closed);
      // the layout stays null and the reader shows its loading state.
      if (!cancelled) setBaseViewports(null);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  // Memoized so the layout keeps its identity across the reader's unrelated
  // re-renders (a page change, the overlay showing): everything that scrolls or
  // measures against it re-runs when it changes.
  return useMemo(
    () => (baseViewports && containerWidth > 0 ? layoutPages(baseViewports, containerWidth, complete) : null),
    [baseViewports, containerWidth, complete],
  );
}

/** Lays the pages out one under another at `containerWidth`; unmeasured pages take the first measured size. */
function layoutPages(
  baseViewports: readonly ({ width: number; height: number } | null)[],
  containerWidth: number,
  complete: boolean,
): PageLayout {
  const fallback = baseViewports.find((vp) => vp != null) ?? FALLBACK_PAGE;
  const heights: number[] = [];
  const offsets: number[] = [];
  const scales: number[] = [];
  let acc = PAGE_GAP;
  for (const vp of baseViewports) {
    const size = vp ?? fallback;
    const scale = containerWidth / size.width;
    const h = size.height * scale;
    scales.push(scale);
    offsets.push(acc);
    heights.push(h);
    acc += h + PAGE_GAP;
  }
  return { heights, offsets, scales, totalHeight: acc, complete };
}

export function pageFromOffset(layout: PageLayout, scrollTop: number): number {
  return pageIndexAtOffset(layout.offsets, scrollTop);
}

export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
