import { useRef } from 'react';
import { X } from 'lucide-react';
import type { Annotation } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { NoteCard } from './NoteCard';
import { SidebarResizeHandle } from './SidebarResizeHandle';

interface NotesSidebarProps {
  /** The Notes to list, already filtered and in reading order. */
  notes: Annotation[];
  showHighlights: boolean;
  onShowHighlightsChange: (show: boolean) => void;
  onClose: () => void;
  /** Current width in pixels, between SIDEBAR_MIN_WIDTH and SIDEBAR_MAX_WIDTH. */
  width: number;
  /** Called with the requested width while the user drags or uses the keyboard; the owner clamps it. */
  onWidthChange: (width: number) => void;
}

/**
 * Right-hand panel listing the open book's Notes. The reader narrows the page
 * to make room for it, so unlike the Reader sidebar it never closes on a click
 * outside and all pointer events stop here to keep clicks from toggling the
 * reader overlay or closing the Reader sidebar.
 */
export function NotesSidebar({
  notes,
  showHighlights,
  onShowHighlightsChange,
  onClose,
  width,
  onWidthChange,
}: NotesSidebarProps) {
  const asideRef = useRef<HTMLElement>(null);

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
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close notes" className="size-7">
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
      <div className="ml-1.5 min-h-0 flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <p className="text-muted-foreground px-3.5 py-6 text-center text-sm">
            {showHighlights ? 'No highlights or notes in this book yet.' : 'No notes in this book yet.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 p-2">
            {notes.map((note) => (
              <NoteCard key={note.id} annotation={note} />
            ))}
          </ul>
        )}
      </div>
      <SidebarResizeHandle panelRef={asideRef} edge="left" width={width} onWidthChange={onWidthChange} />
    </aside>
  );
}
