import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assignImagePositions,
  filterBoilerplateParagraphs,
  fontStyleFromName,
  normalizeReflowSizes,
  reflowPage,
  type PositionedReflowImage,
  type ReflowImage,
  type ReflowParagraph,
  type ReflowTextItem,
} from '@taking-book/core';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  extractImagesFromOperatorList,
  filterBackgroundFigures,
  getObjectAsync,
  tryGetObject,
} from './reflowImages';
import { getPageCached } from './pdf';

/** Text fragment shape from pdf.js getTextContent(), narrowed to what reflow needs. */
interface TextFragment {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

/** Structural slice of pdf.js TextContent, narrowed to the font style map. */
interface PageTextContent {
  styles: Record<string, unknown>;
}

function isTextFragment(item: unknown): item is TextFragment {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item &&
    'width' in item &&
    'height' in item &&
    'fontName' in item
  );
}

function toReflowItem(item: TextFragment, fontStyle: { bold: boolean; italic: boolean }) {
  return {
    str: item.str,
    x: item.transform[4],
    // pdf.js reports y in PDF user space (origin bottom-left, y grows upward);
    // the reflow engine expects y to grow downward, so negate it here.
    y: -item.transform[5],
    width: item.width,
    fontSize: item.transform[0] || item.height || 10,
    bold: fontStyle.bold,
    italic: fontStyle.italic,
  };
}

const EMPTY_FONT_STYLE = { bold: false, italic: false };

/**
 * Resolves each font referenced on the page to its bold/italic flags. The font
 * objects only land in `page.commonObjs` once the page's operator list has been
 * fetched (which is cached per page), so callers must fetch it first; fonts
 * that fail to resolve silently render regular, matching the reflow engine's
 * accepted silent-miss for detection.
 */
function resolveFontStyles(
  page: PDFPageProxy,
  content: PageTextContent,
): Map<string, { bold: boolean; italic: boolean }> {
  const styles = new Map<string, { bold: boolean; italic: boolean }>();
  for (const fontName of Object.keys(content.styles)) {
    const fontObj = tryGetObject(page.commonObjs, fontName) as { name?: string } | undefined;
    styles.set(fontName, fontStyleFromName(fontObj?.name ?? null));
  }
  return styles;
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

export interface ReflowImageOptions {
  /** Fraction of the page area a background image must not cover to be kept. */
  maxPageAreaRatio?: number;
}

/**
 * Extracts the whole document into reflow paragraphs and, when `enabled` is
 * set, the figures placed between them. Pages are processed sequentially but
 * state is flushed in batches so the reader can paint and scroll early instead
 * of freezing until every page is parsed. Image positions are collected from
 * each page's operator list; the pixel data itself is decoded lazily through
 * `getImageData` so off-screen figures cost no decoded memory.
 *
 * `enabled` must be false in page mode: full-document text extraction issues
 * one worker round-trip per page and would starve layout and page rendering
 * on large documents. It is only run when the user enters reflow mode.
 */
export function useReflowDocument(
  pdf: PDFDocumentProxy | null,
  enabled: boolean,
  imageOptions: ReflowImageOptions = {},
): {
  paragraphs: ReflowParagraph[];
  pageTexts: string[];
  error: string | null;
  progress: ReflowProgress | null;
  /** True when the document has enough extractable text to reflow. */
  hasText: boolean;
  images: PositionedReflowImage[];
  /** True once the image position pass has finished (or failed) for this document. */
  imagesReady: boolean;
  /** Resolves a figure's pdf.js image object transferred during extraction. */
  getImageData: (pageIndex: number, ref: string) => Promise<unknown>;
} {
  const [paragraphs, setParagraphs] = useState<ReflowParagraph[]>([]);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const pageWidthsRef = useRef<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ReflowProgress | null>(null);
  // Optimistically true so the reflow toggle isn't spuriously disabled while
  // extraction is still running; it's settled once the full document is parsed.
  const [hasText, setHasText] = useState(true);
  const [rawImages, setRawImages] = useState<ReflowImage[]>([]);
  const [pageAreas, setPageAreas] = useState<Array<number | undefined>>([]);
  const [imagesReady, setImagesReady] = useState(false);
  const allItemsRef = useRef<ReflowTextItem[][]>([]);

  useEffect(() => {
    if (!pdf || !enabled) {
      setParagraphs([]);
      setPageTexts([]);
      setError(null);
      setProgress(null);
      setHasText(true);
      pageWidthsRef.current = [];
      allItemsRef.current = [];
      return;
    }
    let cancelled = false;
    setProgress({ done: 0, total: pdf.numPages });
    pageWidthsRef.current = [];
    allItemsRef.current = [];
    (async () => {
      try {
        const all: ReflowParagraph[] = [];
        const texts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await getPageCached(pdf, i);
          // Operator lists are cached per page; fetching one here forces the
          // page's fonts into `commonObjs` so each fragment's bold/italic can
          // be resolved from its font name.
          const [content] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
          const items: ReturnType<typeof toReflowItem>[] = [];
          const fontStyles = resolveFontStyles(page, content);
          let pageText = '';
          for (const it of content.items) {
            if ('str' in it && typeof it.str === 'string') {
              if (isTextFragment(it)) items.push(toReflowItem(it, fontStyles.get(it.fontName) ?? EMPTY_FONT_STYLE));
              pageText += it.str;
            }
          }
          texts.push(pageText);
          allItemsRef.current.push(items);
          const viewport = page.getViewport({ scale: 1 });
          pageWidthsRef.current = [...pageWidthsRef.current, viewport.width];
          all.push(...reflowPage(items, i - 1));
          // Intermediate flushes show raw text as soon as possible; the final
          // pass applies the boilerplate filter with the complete document so
          // repeated headers/watermarks are judged against every page. Both
          // passes normalize so the reading size is roughly stable while
          // streaming; the final pass recomputes the dominant size from the
          // complete (filtered) document, so a small nudge may land at the end.
          if (i % FLUSH_EVERY_PAGES === 0 && !cancelled) {
            setPageTexts([...texts]);
            setParagraphs(normalizeReflowSizes(all));
            setProgress({ done: i, total: pdf.numPages });
          }
        }
        if (!cancelled) {
          const filtered = filterBoilerplateParagraphs(all);
          const normalized = normalizeReflowSizes(filtered);
          // Detect centered text: if a paragraph's text fragments are centered
          // relative to the page width, mark it with align='center' so it renders
          // centered in reflow mode too.
          const pageWidths = pageWidthsRef.current;
          const pageItems = allItemsRef.current;
          normalized.forEach((para, paraIdx) => {
            const pageIdx = para.pageIndex;
            const itemsForPage = pageItems[pageIdx] ?? [];
            const pageWidth = pageWidths[pageIdx] ?? 0;
            const pageCenter = pageWidth / 2;
            if (itemsForPage.length > 0 && pageWidth > 0) {
              const matchingItems = itemsForPage.filter((it) =>
                para.text.includes(it.str),
              );
              if (matchingItems.length > 0) {
                const avgCenter =
                  matchingItems.reduce(
                    (sum: number, it: { x: number; width: number }) => sum + it.x + it.width / 2,
                    0,
                  ) / matchingItems.length;
                const deviation = Math.abs(avgCenter - pageCenter);
                if (deviation < pageWidth * 0.1) {
                  normalized[paraIdx].align = 'center';
                }
              }
            }
          });
          const chars = normalized.reduce((sum, para) => sum + para.text.length, 0);
          setPageTexts(texts);
          setParagraphs(normalized);
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
  }, [pdf, enabled]);

  // Cheap scan check while in page mode (full extraction is deferred until
  // reflow mode): sample the first pages so scanned PDFs still disable the
  // reflow toggle without parsing the whole document.
  useEffect(() => {
    if (!pdf || enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const samplePages = Math.min(3, pdf.numPages);
        let chars = 0;
        for (let i = 1; i <= samplePages; i++) {
          const page = await getPageCached(pdf, i);
          if (cancelled) return;
          const content = await page.getTextContent();
          if (cancelled) return;
          for (const it of content.items) {
            if ('str' in it && typeof it.str === 'string') chars += it.str.length;
          }
        }
        // Only ever disables: a text-heavy sample proves nothing about the
        // remaining pages (extraction stays optimistic), but an empty sample
        // reliably marks a scan.
        if (!cancelled && chars < 60) setHasText(false);
      } catch {
        // Sampling is best-effort; extraction stays optimistic on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, enabled]);

  useEffect(() => {
    if (!pdf || !enabled) {
      setRawImages([]);
      setPageAreas([]);
      setImagesReady(false);
      return;
    }
    let cancelled = false;
    setImagesReady(false);
    (async () => {
      try {
        const collected: ReflowImage[] = [];
        const areas: Array<number | undefined> = [];
        const seenPlacements = new Set<string>();
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await getPageCached(pdf, i);
          const viewport = page.getViewport({ scale: 1 });
          areas[i - 1] = viewport.width * viewport.height;
          const opList = await page.getOperatorList();
          const found = extractImagesFromOperatorList(opList, i - 1);
          for (const image of found) {
            // Running headers, footers, and watermarks sit at the same spot on
            // every page; keep only the first instance of each placement.
            const key = `${image.x.toFixed(1)}|${image.y.toFixed(1)}|${image.width.toFixed(1)}|${image.height.toFixed(1)}`;
            if (seenPlacements.has(key)) continue;
            seenPlacements.add(key);
            collected.push(image);
          }
          if (!cancelled && i % FLUSH_EVERY_PAGES === 0) {
            setRawImages([...collected]);
            setPageAreas([...areas]);
          }
        }
        if (cancelled) return;
        setRawImages([...collected]);
        setPageAreas([...areas]);
        setImagesReady(true);
        // Keep the transferred image objects in `page.objs` (no cleanup): the
        // figures are decoded lazily by getImageData as they near the viewport,
        // but the pdf.js object must remain resolvable. The pdf is destroyed on
        // close, which releases this memory.
      } catch (err) {
        if (!cancelled) {
          console.warn('Reflow image extraction failed:', err);
          setImagesReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, enabled]);

  const images = useMemo(() => {
    const pagesWithText = new Set(paragraphs.map((para) => para.pageIndex));
    const kept = filterBackgroundFigures(rawImages, pageAreas, pagesWithText, {
      maxPageAreaRatio: imageOptions.maxPageAreaRatio,
    });
    return assignImagePositions(paragraphs, kept);
  }, [paragraphs, rawImages, pageAreas, imageOptions.maxPageAreaRatio]);

  const getImageData = useCallback(
    async (pageIndex: number, ref: string): Promise<unknown> => {
      if (!pdf) return undefined;
      const page = await getPageCached(pdf, pageIndex + 1);
      // pdf.js resolves a page's operator list as soon as it is built, not once
      // every image it references has finished decoding -- a page's largest
      // image (a full-page cover, most often) can still be mid-decode the
      // instant this is called. getObjectAsync waits for it instead of treating
      // "not yet resolved" as "never coming".
      const fromPage = await getObjectAsync(page.objs, ref);
      if (fromPage !== undefined) return fromPage;
      return getObjectAsync(page.commonObjs, ref);
    },
    [pdf],
  );

  return {
    paragraphs,
    pageTexts,
    error,
    progress,
    hasText,
    images,
    imagesReady,
    getImageData,
  };
}