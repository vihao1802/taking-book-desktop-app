import { useMemo, useRef, useState, type ReactElement } from 'react';
import { listLibraryNotes } from '@taking-book/core';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchShortcut } from '@/lib/useSearchShortcut';
import { useLibrary } from '../library/useLibrary';
import { BookNotesSection } from './BookNotesSection';
import { NotesEmptyState } from './NotesEmptyState';
import { useLibraryAnnotations } from './useLibraryAnnotations';
import { useOpenNote, type OpenBookAtNote } from './useOpenNote';

interface NotesViewProps {
  /** Opens a book at one of its Notes; called only for a book whose file can be read. */
  onOpenNote: OpenBookAtNote;
}

/**
 * The app-level Notes view: the Notes of every book in the library, grouped by
 * book with the most recently read first. Its search box and "show highlights
 * too" filter live only as long as the view is open and are separate from the
 * reader's Notes sidebar filter.
 */
export function NotesView({ onOpenNote }: NotesViewProps): ReactElement {
  const { files } = useLibrary();
  const { annotations, loading, error, editActions } = useLibraryAnnotations();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [showHighlights, setShowHighlights] = useState(false);
  const { openNote, error: openError, dismissError } = useOpenNote(onOpenNote);
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchRef);

  const groups = useMemo(
    () => listLibraryNotes(files, annotations, { query, includeHighlights: showHighlights }),
    [files, annotations, query, showHighlights],
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Notes</h1>
        <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showHighlights}
            onChange={(e) => setShowHighlights(e.target.checked)}
            className="accent-primary size-4 cursor-pointer"
          />
          Show highlights too
        </label>
        <Input
          ref={searchRef}
          type="search"
          placeholder="Search books, passages and notes…"
          aria-label="Search notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-80"
        />
      </header>

      {openError && (
        <div role="alert" className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border py-2 pr-2 pl-3 text-sm">
          <p className="flex-1">{openError}</p>
          <Button variant="ghost" size="icon" className="size-6" onClick={dismissError} aria-label="Dismiss message">
            <X className="size-4" />
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {!error && !loading && groups.length === 0 && <NotesEmptyState query={query.trim()} showHighlights={showHighlights} />}
      {groups.length > 0 && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <BookNotesSection
              key={group.file.id}
              {...group}
              onOpenNote={openNote}
              editingId={editingId}
              editActions={editActions}
              onEdit={(note) => setEditingId(note.id)}
              onStopEditing={() => setEditingId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
