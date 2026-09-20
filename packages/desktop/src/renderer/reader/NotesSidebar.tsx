import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { findNearestNote } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import type { Annotation } from '../../shared/types';
import { NoteCard } from './NoteCard';
import { SidebarResizeHandle } from './SidebarResizeHandle';
import type { NotesSidebarState } from './useNotesSidebar';

interface NotesSidebarProps {
  /** The sidebar's state from `useNotesSidebar`; the owner clamps widths requested through it. */
  state: NotesSidebarState;
  /** The PDF page the reader is on; only its value when the sidebar opens matters (see below). */
  readingPage: number;
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
export function NotesSidebar({ state, readingPage, onJump }: NotesSidebarProps) {
  const { notes, showHighlights, onShowHighlightsChange, close, width, onWidthChange } = state;
  const asideRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pageWhenOpened] = useState(readingPage);
  const notesWhenOpenedRef = useRef(notes);

  useEffect(() => {
    const list = listRef.current;
    const nearest = findNearestNote(notesWhenOpenedRef.current, pageWhenOpened);
    const card = nearest ? list?.querySelector(`[data-note-id="${nearest.id}"]`) : null;
    if (!list || !card) return;
    // Scroll the list itself: scrollIntoView would also drag the enclosing
    // reader containers, which are not meant to move when the sidebar opens.
    list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top;
  }, [pageWhenOpened]);

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
      <label className="border-border/60 text-muted-foreground flex cursor-pointer items-center gap-2 border-b py-2 pr-2 pl-3.5 text-xs">
        <input
          type="checkbox"
          checked={showHighlights}
          onChange={(e) => onShowHighlightsChange(e.target.checked)}
          className="accent-primary size-3.5 cursor-pointer"
        />
        Show highlights too
      </label>
      {/* The margins keep the list's scrollbar clear of the resize handle on the left edge. */}
      <div ref={listRef} className="ml-1.5 min-h-0 flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-muted-foreground px-3.5 py-6 text-center text-sm">
            {showHighlights ? 'No highlights or notes in this book yet.' : 'No notes in this book yet.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            {notes.map((note) => (
              <NoteCard key={note.id} annotation={note} onJump={onJump} />
            ))}
          </ul>
        )}
      </div>
      <SidebarResizeHandle panelRef={asideRef} edge="left" width={width} onWidthChange={onWidthChange} />
    </aside>
  );
}
