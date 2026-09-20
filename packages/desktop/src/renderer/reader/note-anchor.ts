import { isPageNote, type Annotation, type PageAnchor, type ReflowAnchor, type ReflowParagraph } from '@taking-book/core';
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
 * Finds a quote that runs across paragraph boundaries on one page. The
 * whitespace-free text of the page's paragraphs is searched as a whole, so the
 * quote may start in the tail of one paragraph and end in the head of another.
 */
function findAcrossParagraphs(paragraphs: readonly ParagraphText[], target: { page: number; quote: string }): ReflowAnchor[] {
  const needle = target.quote.replace(/\s+/g, '');
  if (!needle) return [];
  let stripped = '';
  const owners: Array<{ paraIndex: number; offset: number }> = [];
  paragraphs.forEach((paragraph, paraIndex) => {
    if (paragraph.pageIndex !== target.page - 1) return;
    for (let offset = 0; offset < paragraph.text.length; offset++) {
      if (/\s/.test(paragraph.text[offset])) continue;
      stripped += paragraph.text[offset];
      owners.push({ paraIndex, offset });
    }
  });
  const found = stripped.indexOf(needle);
  if (found === -1) return [];
  const segments: ReflowAnchor[] = [];
  for (const { paraIndex, offset } of owners.slice(found, found + needle.length)) {
    const last = segments[segments.length - 1];
    if (last && last.paraIndex === paraIndex) last.paraEnd = offset + 1;
    else segments.push({ paraIndex, paraStart: offset, paraEnd: offset + 1 });
  }
  return segments;
}

/**
 * Finds every stretch of reflow text a quote covers. Reflow highlights live
 * inside one paragraph, so a quote that runs across paragraphs comes back as
 * one segment per paragraph, in reading order.
 *
 * @param paragraphs - The book's reflow paragraphs.
 * @param target - The 1-based page and the quoted text to find on it.
 * @returns The segments, or an empty list when the quote is not on that page.
 */
export function findReflowSegments(paragraphs: readonly ParagraphText[], target: { page: number; quote: string }): ReflowAnchor[] {
  const single = findReflowAnchor(paragraphs, target);
  return single ? [single] : findAcrossParagraphs(paragraphs, target);
}

/**
 * Finds a quote in a page's text, whitespace-insensitively, as the character
 * range the page view anchors highlights to.
 *
 * @param pageText - The page's text as its text fragments are joined.
 * @param quote - The quoted text to find.
 * @returns The range, or null when the page does not hold the quote.
 */
export function findPageAnchor(pageText: string, quote: string): PageAnchor | null {
  const range = findRangeIgnoringWhitespace(pageText, quote);
  return range ? { pageStart: range[0], pageEnd: range[1] } : null;
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

/** What `fillReflowAnchors` worked out. */
export interface FilledReflowAnchors {
  /** The annotations in the same order, plus the ones that gained an anchor. */
  annotations: Annotation[];
  /** The annotations whose whole quote sits in one paragraph: these anchors are worth saving. */
  filled: Annotation[];
  /**
   * For a quote that runs across paragraphs, the pieces after the first (which
   * is the annotation's own anchor). They are copies with the same id, to be
   * painted in reflow view and left out of lists.
   */
  extraSegments: Annotation[];
}

/**
 * Gives annotations that were made in page view (before any reflow text
 * existed) the reflow anchor they could not get then, so they show and jump in
 * reflow mode. Annotations that already have an anchor, Page notes, and quotes
 * that still match nothing are returned unchanged.
 *
 * @param annotations - The book's annotations.
 * @param paragraphs - The book's fully extracted reflow paragraphs.
 */
export function fillReflowAnchors(annotations: readonly Annotation[], paragraphs: readonly ParagraphText[]): FilledReflowAnchors {
  const filled: Annotation[] = [];
  const extraSegments: Annotation[] = [];
  const result = annotations.map((annotation) => {
    if (!lacksReflowAnchor(annotation)) return annotation;
    const [first, ...rest] = findReflowSegments(paragraphs, annotation);
    if (!first) return annotation;
    const anchored = { ...annotation, ...first };
    // A partial anchor must not be saved: it would make the highlight look
    // shorter than the quote, and the next open would not try again.
    if (rest.length === 0) filled.push(anchored);
    else extraSegments.push(...rest.map((segment) => ({ ...annotation, ...segment })));
    return anchored;
  });
  return { annotations: result, filled, extraSegments };
}
