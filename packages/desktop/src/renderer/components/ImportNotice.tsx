import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import type { BookFile } from '../../shared/types';
import { describeImport, describeImportProgress } from '@/library/import-notice';
import { useLibrary } from '@/library/useLibrary';
import { cn } from '@/lib/utils';

// Long enough to read a summary that names several files; the reader can close it sooner.
const VISIBLE_MS = 10_000;

const NOTICE_CLASS =
  'bg-card text-card-foreground fixed bottom-6 left-1/2 z-20 flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-lg border py-2 pr-2 pl-4 text-sm shadow-lg';

/**
 * Counts a running import ("Adding 12 of 40…"), then reports what it did
 * (added, already in the library, skipped), with an Open action when exactly
 * one Book was involved.
 */
export function ImportNotice({ onOpen }: { onOpen: (file: BookFile) => void }) {
  const { importNotice, importProgress, dismissImportNotice } = useLibrary();

  useEffect(() => {
    if (!importNotice) return;
    const timer = window.setTimeout(dismissImportNotice, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [importNotice, dismissImportNotice]);

  const progressMessage = importProgress && describeImportProgress(importProgress);
  if (progressMessage) {
    return (
      <div role="status" className={cn(NOTICE_CLASS, 'pr-4')}>
        <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
        <span className="tabular-nums">{progressMessage}</span>
      </div>
    );
  }
  if (!importNotice) return null;
  const { message, bookToOpen } = describeImport(importNotice);
  const openBook = (book: BookFile) => {
    dismissImportNotice();
    onOpen(book);
  };

  return (
    <div role="status" className={NOTICE_CLASS}>
      <span className="min-w-0 break-words">{message}</span>
      {bookToOpen && (
        <button
          type="button"
          onClick={() => openBook(bookToOpen)}
          className="text-primary hover:bg-accent shrink-0 cursor-pointer rounded-md px-2 py-1 font-medium"
        >
          Open
        </button>
      )}
      <button
        type="button"
        onClick={dismissImportNotice}
        aria-label="Dismiss"
        className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 cursor-pointer rounded-md p-1"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
