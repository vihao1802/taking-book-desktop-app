import { useEffect, useState } from 'react';
import { filterBoilerplateParagraphs, reflowPage, type ReflowParagraph } from '@taking-book/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Text fragment shape from pdf.js getTextContent(), narrowed to what reflow needs. */
interface TextFragment {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextFragment(item: unknown): item is TextFragment {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item &&
    'width' in item &&
    'height' in item
  );
}

function toReflowItem(item: TextFragment) {
  return {
    str: item.str,
    x: item.transform[4],
    y: item.transform[5],
    width: item.width,
    fontSize: item.transform[0] || item.height || 10,
  };
}

export interface ReflowProgress {
  /** Pages fully extracted so far. */
  done: number;
  /** Total pages in the document. */
  total: number;
}

/**
 * Below this many extractable characters a document is treated as image-based
 * (scanned) with no useful text to reflow. The threshold keeps the reflow
 * toggle on for real books while hiding it for scan-only PDFs.
 */
export const MIN_REFLOW_CHARS = 400;

const FLUSH_EVERY_PAGES = 10;

/**
 * Extracts the whole document into reflow paragraphs. Pages are processed
 * sequentially but state is flushed in batches so the reader can paint and
 * scroll early instead of freezing until every page is parsed.
 */
export function useReflowDocument(pdf: PDFDocumentProxy | null): {
  paragraphs: ReflowParagraph[];
  pageTexts: string[];
  error: string | null;
  progress: ReflowProgress | null;
  /** True when the document has enough extractable text to reflow. */
  hasText: boolean;
} {
  const [paragraphs, setParagraphs] = useState<ReflowParagraph[]>([]);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReflowProgress | null>(null);
  // Optimistically true so the reflow toggle isn't spuriously disabled while
  // extraction is still running; it's settled once the full document is parsed.
  const [hasText, setHasText] = useState(true);

  useEffect(() => {
    if (!pdf) {
      setParagraphs([]);
      setPageTexts([]);
      setError(null);
      setProgress(null);
      setHasText(true);
      return;
    }
    let cancelled = false;
    setProgress({ done: 0, total: pdf.numPages });
    (async () => {
      try {
        const all: ReflowParagraph[] = [];
        const texts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const items: ReturnType<typeof toReflowItem>[] = [];
          let pageText = '';
          for (const it of content.items) {
            if ('str' in it && typeof it.str === 'string') {
              if (isTextFragment(it)) items.push(toReflowItem(it));
              pageText += it.str;
            }
          }
          texts.push(pageText);
          all.push(...reflowPage(items, i - 1));
          // Intermediate flushes show raw text as soon as possible; the final
          // pass applies the boilerplate filter with the complete document so
          // repeated headers/watermarks are judged against every page.
          if (i % FLUSH_EVERY_PAGES === 0 && !cancelled) {
            setPageTexts([...texts]);
            setParagraphs([...all]);
            setProgress({ done: i, total: pdf.numPages });
          }
        }
        if (!cancelled) {
          const filtered = filterBoilerplateParagraphs(all);
          const chars = filtered.reduce((sum, para) => sum + para.text.length, 0);
          setPageTexts(texts);
          setParagraphs(filtered);
          setHasText(chars >= MIN_REFLOW_CHARS);
          setProgress(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setHasText(true);
          setProgress(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return { paragraphs, pageTexts, error, progress, hasText };
}
