import { useEffect, useRef, useState } from 'react';
import { FilePlus2, X } from 'lucide-react';
import { findNearestNote, isPageNote } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import type { Annotation } from '../../shared/types';
import { NoteCard } from './NoteCard';
import { NoteDraftCard } from './NoteDraftCard';
import { NoteEditCard } from './NoteEditCard';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import type { NoteEditActions } from './useAnnotations';
import type { NotesSidebarState } from './useNotesSidebar';
import type { NoteDraftState } from './useNoteDraft';

interface NotesSidebarProps {
  /** The sidebar's state from `useNotesSidebar`; the owner clamps widths requested through it. */
  state: NotesSidebarState;
  /** The Note being written, if any; its card is listed first. */
  noteDraft: NoteDraftState;
  /** The real PDF page the reader is on: the page a new Page note is attached to, and where the list first scrolls (see below). */
  readingPage: number;
  /** Stores edits to and deletions of the annotation whose card is in edit mode. */
  editActions: NoteEditActions;
  /** Called when the reader clicks a Note, to jump to where it was written. */
  onJump: (annotation: Annotation) => void;
}

/**
 * Right-hand panel listing the open book's Notes. The reader narrows the page
 * to make room for it, so unlike the Reader sidebar it never closes on a click
 * outside and all pointer events stop here to keep clicks from toggling the
 * reader overlay or closing the Reader sidebar. When it opens, the list scrolls
 * once to the Note nearest the reading page and then stays put: a list that
 * followed every page turn would move under the pointer while a Note is clicked.
 */
export function NotesSidebar({ state, noteDraft, readingPage, editActions, onJump }: NotesSidebarProps) {
  const { notes, showHighlights, onShowHighlightsChange, close, width, onWidthChange, editingId, selectedId, focusRequest, stopEditing } = state;
  const focusedId = editingId ?? selectedId;
  const asideRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pageWhenOpened] = useState(readingPage);
  const notesWhenOpenedRef = useRef(notes);
  const hadDraftWhenOpenedRef = useRef(noteDraft.draft !== null);
  // Clicking a highlight on the page opens the sidebar on that card; the
  // "nearest note" scroll below must not fight the scroll to it.
  const hadFocusedCardWhenOpenedRef = useRef(focusedId !== null);

  // Bring the card being edited or selected into view, including when its highlight is clicked again.
  useEffect(() => {
    if (focusedId === null) return;
    listRef.current?.querySelector(`[data-note-id="${focusedId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId, focusRequest]);

  useEffect(() => {
    // A draft waiting at the top of the list is what the reader came back to write; keep it in view.
    if (hadDraftWhenOpenedRef.current || hadFocusedCardWhenOpenedRef.current) return;
    const list = listRef.current;
    const nearest = findNearestNote(notesWhenOpenedRef.current, pageWhenOpened);
    const card = nearest ? list?.querySelector(`[data-note-id="${nearest.id}"]`) : null;
    if (!list || !card) return;
    // Scroll the list itself: scrollIntoView would also drag the enclosing
    // reader containers, which are not meant to move when the sidebar opens.
    list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }, [pageWhenOpened]);

  const addPageNote = () => {
    // The draft card that opens is the one card being worked on, as when a passage is selected.
    stopEditing();
    noteDraft.startPageNote(readingPage);
  };

  return (
    <aside
      ref={asideRef}
      aria-label="Notes"
      style={{ width }}
      className="notes-sidebar bg-overlay text-foreground pointer-events-auto absolute top-16 right-2 bottom-16 z-[5] flex max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg shadow-lg backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="border-border/60 flex items-center gap-1 border-b py-1.5 pr-2 pl-3.5">
        <h2 className="flex-1 text-sm font-medium">Notes</h2>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Close notes" className="size-7">
          <X className="size-4" />
        </Button>
      </div>
      <div className="border-border/60 flex border-b px-2 py-1.5">
        <Button variant="ghost" size="sm" className="h-auto gap-1.5 px-1.5 py-1 text-xs" onClick={addPageNote}>
          <FilePlus2 className="size-3.5" />
          Page note
        </Button>
      </div>
      <label className="border-border/60 text-muted-foreground flex cursor-pointer items-center gap-2 border-b py-2 pr-2 pl-3.5 text-xs">
        <input
          type="checkbox"
          checked={showHighlights}
          onChange={(e) => onShowHighlightsChange(e.target.checked)}
          className="accent-primary size-3.5 cursor-pointer"
        />
        Show highlights
      </label>
      {/* The margins keep the list's scrollbar clear of the resize handle on the left edge. */}
      <div ref={listRef} className="ml-1.5 min-h-0 flex-1 overflow-y-auto">
        {notes.length === 0 && noteDraft.draft === null ? (
          <p className="text-muted-foreground px-3.5 py-6 text-center text-sm">
            {showHighlights ? 'No highlights or notes in this book yet.' : 'No notes in this book yet.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            <NoteDraftCard key={noteDraft.draftKey} state={noteDraft} />
            {notes.map((note) =>
              note.id === editingId ? (
                <NoteEditCard key={note.id} annotation={note} actions={editActions} onDone={stopEditing} />
              ) : (
                <NoteCard
                  key={note.id}
                  annotation={note}
                  selected={note.id === selectedId}
                  onJump={onJump}
                  onEdit={isPageNote(note) ? state.editAnnotation : undefined}
                />
              ),
            )}
          </ul>
        )}
      </div>
      <SidebarResizeHandle panelRef={asideRef} edge="left" width={width} onWidthChange={onWidthChange} />
    </aside>
  );
}
