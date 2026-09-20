import type { ReflowParagraph } from '@taking-book/core';
import type { NoteAnchor } from '../../shared/types';
import { findRangeIgnoringWhitespace } from './highlights';
import type { PageTextSelection } from './PdfPageView';

/**
 * Turns a text selection made in page view into a Note anchor. The anchor also
 * gets a best-effort reflow position so the highlight appears in reflow mode
 * too: the first paragraph on the same page that holds the quote is used, found
 * whitespace-insensitively because the two views join text fragments differently.
 *
 * @param paragraphs - The book's reflow paragraphs; empty until reflow text has been extracted.
 * @param selection - The passage selected on a page.
 * @returns The page anchor, with the paragraph fields null when no paragraph matches.
 */
export function buildNoteAnchor(
  paragraphs: readonly Pick<ReflowParagraph, 'pageIndex' | 'text'>[],
  selection: PageTextSelection,
): NoteAnchor {
  let paraIndex: number | null = null;
  let paraStart: number | null = null;
  let paraEnd: number | null = null;
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].pageIndex !== selection.page - 1) continue;
    const range = findRangeIgnoringWhitespace(paragraphs[i].text, selection.quote);
    if (range) {
      paraIndex = i;
      paraStart = range[0];
      paraEnd = range[1];
      break;
    }
  }
  return {
    page: selection.page,
    pageStart: selection.start,
    pageEnd: selection.end,
    quote: selection.quote,
    paraIndex,
    paraStart,
    paraEnd,
  };
}
