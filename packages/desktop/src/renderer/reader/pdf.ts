import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const PAGE_GAP = 12;

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
      task.destroy();
    };
  }, [url]);

  return { pdf, error };
}

export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

export interface PageLayout {
  heights: number[];
  offsets: number[];
  scales: number[];
  totalHeight: number;
}

export function usePageLayout(pdf: PDFDocumentProxy | null, containerWidth: number): PageLayout | null {
  const [baseViewports, setBaseViewports] = useState<{ width: number; height: number }[] | null>(null);

  useEffect(() => {
    if (!pdf) {
      setBaseViewports(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const vps: { width: number; height: number }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        vps.push(page.getViewport({ scale: 1 }));
      }
      if (!cancelled) setBaseViewports(vps);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  if (!baseViewports || containerWidth <= 0) return null;

  const heights: number[] = [];
  const offsets: number[] = [];
  const scales: number[] = [];
  let acc = PAGE_GAP;
  for (const vp of baseViewports) {
    const scale = containerWidth / vp.width;
    const h = vp.height * scale;
    scales.push(scale);
    offsets.push(acc);
    heights.push(h);
    acc += h + PAGE_GAP;
  }
  return { heights, offsets, scales, totalHeight: acc };
}

export function pageFromOffset(layout: PageLayout, scrollTop: number): number {
  const { offsets } = layout;
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= scrollTop) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
