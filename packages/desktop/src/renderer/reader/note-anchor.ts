import { isPageNote, type Annotation, type ReflowAnchor, type ReflowParagraph } from '@taking-book/core';
import type { NoteAnchor } from '../../shared/types';
import { findRangeIgnoringWhitespace } from './highlights';
import type { PageTextSelection } from './PdfPageView';

type ParagraphText = Pick<ReflowParagraph, 'pageIndex' | 'text'>;

/**
 * Finds where a quote sits in the reflow text: the first paragraph on the same
 * page that holds it, matched whitespace-insensitively because the page and
 * reflow views join text fragments differently.
 *
 * @param paragraphs - The book's reflow paragraphs; empty until reflow text has been extracted.
 * @param target - The 1-based page and the quoted text to find on it.
 * @returns The paragraph range, or null when no paragraph on that page holds the quote.
 */
export function findReflowAnchor(
  paragraphs: readonly ParagraphText[],
  target: { page: number; quote: string },
): ReflowAnchor | null {
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].pageIndex !== target.page - 1) continue;
    const range = findRangeIgnoringWhitespace(paragraphs[i].text, target.quote);
    if (range) return { paraIndex: i, paraStart: range[0], paraEnd: range[1] };
  }
  return null;
}

/**
 * Turns a text selection made in page view into a Note anchor. The anchor also
 * gets a best-effort reflow position so the highlight appears in reflow mode
 * too (see `findReflowAnchor`).
 *
 * @param paragraphs - The book's reflow paragraphs; empty until reflow text has been extracted.
 * @param selection - The passage selected on a page.
 * @returns The page anchor, with the paragraph fields null when no paragraph matches.
 */
export function buildNoteAnchor(paragraphs: readonly ParagraphText[], selection: PageTextSelection): NoteAnchor {
  const reflow = findReflowAnchor(paragraphs, selection);
  return {
    page: selection.page,
    pageStart: selection.start,
    pageEnd: selection.end,
    quote: selection.quote,
    paraIndex: reflow?.paraIndex ?? null,
    paraStart: reflow?.paraStart ?? null,
    paraEnd: reflow?.paraEnd ?? null,
  };
}

/** An annotation made in page view, whose reflow anchor was not known when it was made. */
function lacksReflowAnchor(annotation: Annotation): boolean {
  return !isPageNote(annotation) && annotation.paraIndex === null;
}

/**
 * Gives annotations that were made in page view (before any reflow text
 * existed) the reflow anchor they could not get then, so they show and jump in
 * reflow mode. Annotations that already have an anchor, Page notes, and quotes
 * that still match nothing are returned unchanged.
 *
 * @param annotations - The book's annotations.
 * @param paragraphs - The book's fully extracted reflow paragraphs.
 * @returns The annotations in the same order, plus the ones that gained an anchor.
 */
export function fillReflowAnchors(
  annotations: readonly Annotation[],
  paragraphs: readonly ParagraphText[],
): { annotations: Annotation[]; filled: Annotation[] } {
  const filled: Annotation[] = [];
  const result = annotations.map((annotation) => {
    if (!lacksReflowAnchor(annotation)) return annotation;
    const anchor = findReflowAnchor(paragraphs, annotation);
    if (!anchor) return annotation;
    const anchored = { ...annotation, ...anchor };
    filled.push(anchored);
    return anchored;
  });
  return { annotations: result, filled };
}
