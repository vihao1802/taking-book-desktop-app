import { useCallback, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { Annotation, BookFile } from '@/reader-api';

/** Opens a book on a Note; the callback the app provides once the book is known to be readable. */
export type OpenBookAtNote = (file: BookFile, note: Annotation) => void;

interface OpenNoteState {
  /** Opens the Note's book at the Note, or sets `error` when the book cannot be opened. */
  openNote: (file: BookFile, note: Annotation) => Promise<void>;
  /** A user-facing message about the last book that could not be opened; null when there is none. */
  error: string | null;
  dismissError: () => void;
}

function describeOpenFailure(file: BookFile, reason: string): string {
  return `Couldn't open “${file.title}”. ${reason}`;
}

/**
 * Lets the Notes view take the reader from a Note to the exact spot in its
 * book. The book's file is checked first so that a book whose file has moved
 * leaves the reader on the Notes view with a message, instead of dropping them
 * into an empty reader they then have to back out of.
 *
 * @param openBookAtNote - Called with the book and Note once the book is readable.
 */
export function useOpenNote(openBookAtNote: OpenBookAtNote): OpenNoteState {
  const [error, setError] = useState<string | null>(null);

  const openNote = useCallback(
    async (file: BookFile, note: Annotation): Promise<void> => {
      setError(null);
      try {
        const readable = await window.api.checkFileReadable(file.path);
        if (isOk(readable)) openBookAtNote(file, note);
        else setError(describeOpenFailure(file, readable.error));
      } catch (caught) {
        console.error(`Could not check the file of book ${file.id} before opening a Note:`, caught);
        setError(describeOpenFailure(file, 'Its file could not be checked.'));
      }
    },
    [openBookAtNote],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { openNote, error, dismissError };
}
