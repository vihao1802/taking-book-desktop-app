import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
// eslint-disable-next-line import/no-unresolved
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { processPagesInOrder } from '@taking-book/core';
import type { QuizScopePage } from '@/reader-api';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

let sharedWorker: pdfjs.PDFWorker | null = null;

/** One pdf.js worker shared by every Quiz text extraction, like `BookCover`'s cover renders. */
function getQuizWorker(): pdfjs.PDFWorker {
  sharedWorker ??= new pdfjs.PDFWorker();
  return sharedWorker;
}

export interface QuizScopeTextState {
  pages: QuizScopePage[];
  loading: boolean;
  error: string | null;
  /**
   * True once extraction for the current `filePath`/`startPage`/`endPage` has
   * finished (with or without an error). Distinguishes "not started yet" from
   * a legitimately empty result (e.g. a scanned range with no text), both of
   * which otherwise look like `{ pages: [], loading: false, error: null }`.
   */
  settled: boolean;
}

/**
 * Extracts the plain text of a page range directly from the PDF, without
 * opening the reader. Quiz starts from the Book detail or library view, so
 * unlike `usePageTexts` this loads its own off-screen pdf.js document instead
 * of reusing one the reader already has open.
 *
 * @param filePath - The Book's file path; extraction is skipped while null.
 * @param startPage - First real PDF page (inclusive) to extract.
 * @param endPage - Last real PDF page (inclusive) to extract; the Quiz scope's end.
 */
export function useQuizScopeText(
  filePath: string | null,
  startPage: number,
  endPage: number,
): QuizScopeTextState {
  const [state, setState] = useState<QuizScopeTextState>({ pages: [], loading: false, error: null, settled: false });
  const requestRef = useRef(0);

  useEffect(() => {
    if (!filePath || startPage > endPage) {
      setState({ pages: [], loading: false, error: null, settled: false });
      return;
    }
    const requestId = ++requestRef.current;
    let cancelled = false;
    setState({ pages: [], loading: true, error: null, settled: false });

    const task = pdfjs.getDocument({
      url: window.api.getDocumentUrl(filePath),
      standardFontDataUrl: 'appfile://fonts/',
      wasmUrl: 'appfile://wasm/',
      worker: getQuizWorker(),
    });

    (async () => {
      const doc = await task.promise;
      try {
        const total = endPage - startPage + 1;
        const collected: QuizScopePage[] = [];
        await processPagesInOrder({
          total,
          concurrency: 3,
          isCancelled: () => cancelled,
          processPage: async (offset) => {
            const pageNumber = startPage + offset - 1;
            const page = await doc.getPage(pageNumber);
            const content = await page.getTextContent();
            let text = '';
            for (const item of content.items) {
              if ('str' in item && typeof item.str === 'string') text += item.str;
            }
            return { page: pageNumber, text };
          },
          onPage: (_offset, result) => collected.push(result),
        });
        if (!cancelled && requestRef.current === requestId) {
          setState({ pages: collected, loading: false, error: null, settled: true });
        }
      } finally {
        await task.destroy();
      }
    })().catch((error: unknown) => {
      if (cancelled || requestRef.current !== requestId) return;
      setState({ pages: [], loading: false, error: `Could not read this book's text: ${errorMessage(error)}`, settled: true });
    });

    return () => {
      cancelled = true;
    };
  }, [filePath, startPage, endPage]);

  return state;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
