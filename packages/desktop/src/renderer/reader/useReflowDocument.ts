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

export function useReflowDocument(pdf: PDFDocumentProxy | null): {
  paragraphs: ReflowParagraph[];
  pageTexts: string[];
  error: string | null;
} {
  const [paragraphs, setParagraphs] = useState<ReflowParagraph[]>([]);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdf) {
      setParagraphs([]);
      setPageTexts([]);
      setError(null);
      return;
    }
    let cancelled = false;
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
        }
        if (!cancelled) {
          setPageTexts(texts);
          setParagraphs(filterBoilerplateParagraphs(all));
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return { paragraphs, pageTexts, error };
}
