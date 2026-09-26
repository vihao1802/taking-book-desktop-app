import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { BookFile } from '../../shared/types';
import { describeImport } from '@/library/import-notice';
import { useLibrary } from '@/library/useLibrary';

// Long enough to read a summary that names several files; the reader can close it sooner.
const VISIBLE_MS = 10_000;

/**
 * Reports what the latest import did (added, already in the library,
 * skipped), with an Open action when exactly one Book was involved.
 */
export function ImportNotice({ onOpen }: { onOpen: (file: BookFile) => void }) {
  const { importNotice, dismissImportNotice } = useLibrary();

  useEffect(() => {
    if (!importNotice) return;
    const timer = window.setTimeout(dismissImportNotice, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [importNotice, dismissImportNotice]);

  if (!importNotice) return null;
  const { message, bookToOpen } = describeImport(importNotice);
  const openBook = (book: BookFile) => {
    dismissImportNotice();
    onOpen(book);
  };

  return (
    <div
      role="status"
      className="bg-card text-card-foreground fixed bottom-6 left-1/2 z-20 flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-lg border py-2 pr-2 pl-4 text-sm shadow-lg"
    >
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
