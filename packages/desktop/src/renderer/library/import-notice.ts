import type { BookFile, ImportSummary } from '@taking-book/core';

export interface ImportNoticeContent {
  message: string;
  /** The one Book the import involved, which the notice offers to open; null when it involved zero or several. */
  bookToOpen: BookFile | null;
}

const SEPARATOR = ' · ';

/**
 * Turns an import summary into the notice shown after Add PDF or Drop import:
 * each non-zero count as its own phrase, and an Open action only when exactly
 * one Book (added or already in the library) was involved.
 */
export function describeImport(summary: ImportSummary): ImportNoticeContent {
  const involved = [...summary.added, ...summary.alreadyInLibrary];
  return {
    message: describeCounts(summary).join(SEPARATOR),
    bookToOpen: involved.length === 1 ? involved[0] : null,
  };
}

function describeCounts(summary: ImportSummary): string[] {
  const { added, alreadyInLibrary, skipped } = summary;
  const phrases: string[] = [];
  if (added.length > 0) phrases.push(`Added ${added.length} ${added.length === 1 ? 'book' : 'books'}`);
  else if (alreadyInLibrary.length === 0) phrases.push('No books added');
  if (alreadyInLibrary.length > 0) phrases.push(`${alreadyInLibrary.length} already in your library`);

  const notPdfCount = skipped.filter((s) => s.reason === 'not-pdf').length;
  if (notPdfCount === 1) phrases.push("Skipped 1 file that isn't a PDF");
  if (notPdfCount > 1) phrases.push(`Skipped ${notPdfCount} files that aren't PDFs`);

  const unreadable = skipped.filter((s) => s.reason === 'unreadable').map((s) => s.fileName);
  if (unreadable.length === 1) phrases.push(`Couldn't read ${unreadable[0]}`);
  if (unreadable.length > 1) phrases.push(`Couldn't read ${unreadable.length} files: ${unreadable.join(', ')}`);
  return phrases;
}

/**
 * The Book Add PDF opens straight away: the one newly added Book, but only
 * when nothing else happened. Opening the reader leaves the view that shows
 * the notice, so a batch that also skipped files or met existing Books stays
 * put and lets the notice report it (still offering Open when one Book was involved).
 */
export function bookToOpenAfterAddPdf(summary: ImportSummary): BookFile | null {
  const onlyOneNewBook = summary.added.length === 1 && summary.alreadyInLibrary.length === 0 && summary.skipped.length === 0;
  return onlyOneNewBook ? summary.added[0] : null;
}
