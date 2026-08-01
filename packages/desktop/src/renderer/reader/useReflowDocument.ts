import { useEffect, useState } from 'react';
import { reflowPage, type ReflowParagraph } from '@taking-book/core';
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

export function useReflowDocument(pdf: PDFDocumentProxy | null): {
  paragraphs: ReflowParagraph[];
  error: string | null;
} {
  const [paragraphs, setParagraphs] = useState<ReflowParagraph[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdf) {
      setParagraphs([]);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all: ReflowParagraph[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const items: ReturnType<typeof toReflowItem>[] = [];
          for (const it of content.items) {
            if (isTextFragment(it)) items.push(toReflowItem(it));
          }
          all.push(...reflowPage(items, i - 1));
        }
        if (!cancelled) setParagraphs(all);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return { paragraphs, error };
}
