import { describe, expect, it } from 'vitest';
import type { BookFile, ImportSummary, SkippedImport } from '@taking-book/core';
import { bookToOpenAfterAddPdf, describeImport, describeImportProgress } from './import-notice';

function book(id: number): BookFile {
  return {
    id,
    hash: `h${id}`,
    path: `/store/h${id}`,
    title: `Book ${id}`,
    status: 'unread',
    tags: [],
    favorite: false,
    lastPage: null,
    lastPosition: null,
    lastMode: 'page',
    pageCount: null,
    zoom: null,
    reflowZoom: null,
    lastReadAt: null,
    createdAt: '2026-01-01 00:00:00',
  };
}

function notPdf(fileName: string): SkippedImport {
  return { fileName, reason: 'not-pdf', detail: null };
}

function unreadable(fileName: string): SkippedImport {
  return { fileName, reason: 'unreadable', detail: 'EACCES' };
}

function summary(parts: Partial<ImportSummary>): ImportSummary {
  return { added: [], alreadyInLibrary: [], skipped: [], ...parts };
}

describe('describeImport', () => {
  it('reports one added Book in the singular and offers to open it', () => {
    const notice = describeImport(summary({ added: [book(1)] }));
    expect(notice.message).toBe('Added 1 book');
    expect(notice.bookToOpen?.id).toBe(1);
  });

  it('reports several added Books in the plural with no Open action', () => {
    const notice = describeImport(summary({ added: [book(1), book(2)] }));
    expect(notice.message).toBe('Added 2 books');
    expect(notice.bookToOpen).toBeNull();
  });

  it('joins every non-zero count, in order', () => {
    const notice = describeImport(
      summary({ added: [book(1), book(2)], alreadyInLibrary: [book(3)], skipped: [notPdf('a.txt')] }),
    );
    expect(notice.message).toBe("Added 2 books · 1 already in your library · Skipped 1 file that isn't a PDF");
  });

  it('pluralises skipped non-PDFs', () => {
    const notice = describeImport(summary({ added: [book(1)], skipped: [notPdf('a.txt'), notPdf('b.doc')] }));
    expect(notice.message).toBe("Added 1 book · Skipped 2 files that aren't PDFs");
  });

  it('offers to open the one Book that was already in the library', () => {
    const notice = describeImport(summary({ alreadyInLibrary: [book(7)] }));
    expect(notice.message).toBe('1 already in your library');
    expect(notice.bookToOpen?.id).toBe(7);
  });

  it('offers no Open action when an added and an existing Book are both involved', () => {
    const notice = describeImport(summary({ added: [book(1)], alreadyInLibrary: [book(2)] }));
    expect(notice.bookToOpen).toBeNull();
  });

  it('names a file that could not be read', () => {
    const notice = describeImport(summary({ added: [book(1)], skipped: [unreadable('locked.pdf')] }));
    expect(notice.message).toBe("Added 1 book · Couldn't read locked.pdf");
  });

  it('names every file that could not be read', () => {
    const notice = describeImport(summary({ skipped: [unreadable('a.pdf'), unreadable('b.pdf')] }));
    expect(notice.message).toBe("No books added · Couldn't read 2 files: a.pdf, b.pdf");
  });

  it('leads with "No books added" when only skips happened', () => {
    const notice = describeImport(summary({ skipped: [notPdf('a.txt')] }));
    expect(notice.message).toBe("No books added · Skipped 1 file that isn't a PDF");
    expect(notice.bookToOpen).toBeNull();
  });

  it('says so when there was nothing at all to add', () => {
    expect(describeImport(summary({})).message).toBe('No books added');
  });
});

describe('bookToOpenAfterAddPdf', () => {
  it('opens a single newly added Book straight away', () => {
    expect(bookToOpenAfterAddPdf(summary({ added: [book(1)] }))?.id).toBe(1);
  });

  it('stays on the view when the single new Book came with skips, so the notice can report them', () => {
    expect(bookToOpenAfterAddPdf(summary({ added: [book(1)], skipped: [notPdf('a.txt')] }))).toBeNull();
  });

  it('stays on the view when the single new Book came with one already in the library', () => {
    expect(bookToOpenAfterAddPdf(summary({ added: [book(1)], alreadyInLibrary: [book(2)] }))).toBeNull();
  });

  it('stays on the view for a Book that was already in the library', () => {
    expect(bookToOpenAfterAddPdf(summary({ alreadyInLibrary: [book(2)] }))).toBeNull();
  });

  it('stays on the view when several Books were added', () => {
    expect(bookToOpenAfterAddPdf(summary({ added: [book(1), book(2)] }))).toBeNull();
  });
});

describe('describeImportProgress', () => {
  it('counts the PDF being added, starting from the first', () => {
    expect(describeImportProgress({ done: 0, total: 40 })).toBe('Adding 1 of 40…');
    expect(describeImportProgress({ done: 11, total: 40 })).toBe('Adding 12 of 40…');
  });

  it('never counts past the total once the last PDF is done', () => {
    expect(describeImportProgress({ done: 40, total: 40 })).toBe('Adding 40 of 40…');
  });

  it('shows no count for a single PDF, which is done too soon to need one', () => {
    expect(describeImportProgress({ done: 0, total: 1 })).toBeNull();
  });
});
