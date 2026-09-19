import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPageCached } from './pdf';

const FLUSH_EVERY_PAGES = 25;

export interface PageTextsProgress {
  done: number;
  total: number;
}

/**
 * Loads the plain text of every page so the find bar can search a document in
 * page mode. Extraction is deferred until `enabled` (the find bar opening):
 * like reflow extraction it costs one worker round-trip per page, so it must
 * not run for readers who never search. Text is joined per page exactly as the
 * pdf.js text layer lays it out, so match offsets line up with the DOM.
 *
 * @param pdf - The open document, or null while it loads.
 * @param enabled - Start (and keep) extraction; the result is cached per document.
 * @returns The page texts loaded so far and progress while still loading.
 */
export function usePageTexts(
  pdf: PDFDocumentProxy | null,
  enabled: boolean,
): { texts: string[]; progress: PageTextsProgress | null } {
  const [texts, setTexts] = useState<string[]>([]);
  const [progress, setProgress] = useState<PageTextsProgress | null>(null);
  const loadedPdfRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!pdf || !enabled || loadedPdfRef.current === pdf) return;
    let cancelled = false;
    setTexts([]);
    setProgress({ done: 0, total: pdf.numPages });
    (async () => {
      const collected: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await getPageCached(pdf, pageNumber);
        const content = await page.getTextContent();
        if (cancelled) return;
        let pageText = '';
        for (const item of content.items) {
          if ('str' in item && typeof item.str === 'string') pageText += item.str;
        }
        collected.push(pageText);
        if (pageNumber % FLUSH_EVERY_PAGES === 0) {
          setTexts([...collected]);
          setProgress({ done: pageNumber, total: pdf.numPages });
        }
      }
      loadedPdfRef.current = pdf;
      setTexts(collected);
      setProgress(null);
    })().catch((err) => {
      // Closing the document mid-extraction rejects every in-flight call.
      if (cancelled || pdf.loadingTask.destroyed) return;
      console.error('Failed to extract page text for search', err);
      setProgress(null);
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, enabled]);

  return { texts, progress };
}
