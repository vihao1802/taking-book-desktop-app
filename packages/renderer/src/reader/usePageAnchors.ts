import { useEffect, useMemo, useState } from 'react';
import { isOk, isPageNote, type PageAnchor } from '@taking-book/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation } from '@/reader-api';
import { findPageAnchor } from './note-anchor';
import { getPageCached } from './pdf';

interface UsePageAnchorsOptions {
  pdf: PDFDocumentProxy | null;
  /** The open book's annotations as stored. */
  annotations: Annotation[];
}

interface PageAnchored {
  annotations: Annotation[];
  /** False while some annotation still has to be looked up, so a jump to it should wait. */
  ready: boolean;
}

/** An annotation with a quote but no page-text anchor: made in reflow view, where its quote did not match the page. */
function lacksPageAnchor(annotation: Annotation): boolean {
  return !isPageNote(annotation) && (annotation.pageStart === null || annotation.pageEnd === null);
}

/** The page's text as its fragments are joined, which is what page anchors count characters in. */
async function loadPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const content = await (await getPageCached(pdf, pageNumber)).getTextContent();
  return content.items.map((item) => ('str' in item && typeof item.str === 'string' ? item.str : '')).join('');
}

function savePageAnchor(annotationId: number, anchor: PageAnchor): void {
  window.api
    .setAnnotationPageAnchor(annotationId, anchor)
    .then((result) => {
      if (!isOk(result)) console.warn(`Could not save the page anchor of annotation ${annotationId}:`, result.error);
    })
    .catch((error: unknown) => console.warn(`Could not save the page anchor of annotation ${annotationId}:`, error));
}

/**
 * Gives annotations made in reflow view their page anchor when it was missing
 * at creation (the page's text was not yet extracted). Only the pages of those
 * annotations are read, so it costs nothing for a book without any. Each anchor
 * found is saved once; a quote that matches nothing is not looked up again.
 */
export function usePageAnchors({ pdf, annotations }: UsePageAnchorsOptions): PageAnchored {
  const [found, setFound] = useState<ReadonlyMap<number, PageAnchor>>(new Map());
  const [settled, setSettled] = useState<ReadonlySet<number>>(new Set());

  const pending = useMemo(
    () => annotations.filter((annotation) => lacksPageAnchor(annotation) && !settled.has(annotation.id)),
    [annotations, settled],
  );
  const pendingKey = pending.map((annotation) => annotation.id).join(',');

  useEffect(() => {
    if (!pdf || pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const anchors = new Map<number, PageAnchor>();
      const pageTexts = new Map<number, string>();
      for (const annotation of pending) {
        try {
          if (!pageTexts.has(annotation.page)) pageTexts.set(annotation.page, await loadPageText(pdf, annotation.page));
        } catch (error) {
          console.warn(`Could not read page ${annotation.page} to anchor annotation ${annotation.id}:`, error);
          continue;
        }
        const anchor = findPageAnchor(pageTexts.get(annotation.page) ?? '', annotation.quote);
        if (anchor) anchors.set(annotation.id, anchor);
      }
      if (cancelled) return;
      for (const [id, anchor] of anchors) savePageAnchor(id, anchor);
      setFound((previous) => new Map([...previous, ...anchors]));
      setSettled((previous) => new Set([...previous, ...pending.map((annotation) => annotation.id)]));
    })();
    return () => {
      cancelled = true;
    };
    // `pending` changes identity with every annotation edit; its ids are what matter.
  }, [pdf, pendingKey]);

  const anchored = useMemo(
    () => annotations.map((annotation) => (found.has(annotation.id) ? { ...annotation, ...found.get(annotation.id) } : annotation)),
    [annotations, found],
  );
  return { annotations: anchored, ready: pending.length === 0 };
}
