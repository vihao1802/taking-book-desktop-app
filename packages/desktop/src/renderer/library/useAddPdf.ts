import { useCallback } from 'react';
import type { BookFile } from '../../shared/types';
import { bookToOpenAfterAddPdf } from './import-notice';
import { useLibrary } from './useLibrary';

/**
 * Add PDF, as every button offering it behaves: pressing it usually means
 * "I want to read this now", so a single newly added Book opens straight
 * away; any other outcome stays on the view and the import notice reports it.
 */
export function useAddPdf(onOpen: (file: BookFile) => void): () => Promise<void> {
  const { addFiles } = useLibrary();
  return useCallback(async () => {
    const summary = await addFiles();
    const book = summary ? bookToOpenAfterAddPdf(summary) : null;
    if (book) onOpen(book);
  }, [addFiles, onOpen]);
}
