import type { ReactElement } from 'react';
import { NotebookText } from 'lucide-react';

interface NotesEmptyStateProps {
  /** The trimmed search text; non-empty means the search found nothing rather than there being no Notes at all. */
  query: string;
  showHighlights: boolean;
}

/** What the Notes view says when it has nothing to list: no Notes at all, or a search with no match. */
export function NotesEmptyState({ query, showHighlights }: NotesEmptyStateProps): ReactElement {
  const message =
    query !== ''
      ? `No notes match “${query}”.`
      : showHighlights
        ? 'No highlights or notes yet.'
        : 'No notes yet. Select text in a book to write one.';

  return (
    <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
      <NotebookText className="size-8 opacity-40" />
      <p>{message}</p>
    </div>
  );
}
