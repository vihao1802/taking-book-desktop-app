import type { KeyboardEvent, ReactNode, Ref } from 'react';
import type { AnnotationColor } from '../../shared/types';
import { HIGHLIGHT_FILL } from './highlights';
import { resolveNoteDraftKey } from './note-draft-keys';

interface NoteCardShellProps {
  /** Accessible name of the card. */
  label: string;
  /** The line above the passage, e.g. the page the Note is on. */
  header: string;
  /** The passage the Note is about, in its highlight color; null for a Page note, which has none. */
  quote: { text: string; color: AnnotationColor } | null;
  /** Local id of the annotation being edited, so the sidebar can scroll to the card; omitted for a draft. */
  noteId?: number;
  cardRef?: Ref<HTMLLIElement>;
  /** Cmd/Ctrl+Enter anywhere in the card. */
  onSave: () => void;
  /** Escape anywhere in the card. */
  onCancel: () => void;
  children: ReactNode;
}

/**
 * The frame shared by the card where a Note is written and the card where a
 * stored Note is edited: header, quoted passage, and the keyboard shortcuts.
 * The keys are handled on the card, not the text box, so Escape and Cmd/Ctrl+Enter
 * also work from a color swatch or a button.
 */
export function NoteCardShell({ label, header, quote, noteId, cardRef, onSave, onCancel, children }: NoteCardShellProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    const action = resolveNoteDraftKey(event.nativeEvent);
    if (action === null) return;
    // Escape would otherwise also close the reader's layers underneath (sidebar, then reader).
    event.preventDefault();
    event.stopPropagation();
    if (action === 'save') onSave();
    else onCancel();
  };

  return (
    <li
      ref={cardRef}
      data-note-id={noteId}
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="border-primary/60 bg-background/60 flex flex-col gap-2 rounded-md border p-2.5"
    >
      <div className="text-muted-foreground text-xs">{header}</div>
      {quote && (
        <blockquote
          className="text-muted-foreground line-clamp-4 border-l-2 pl-2 text-xs italic"
          style={{ borderColor: HIGHLIGHT_FILL[quote.color] }}
        >
          {quote.text}
        </blockquote>
      )}
      {children}
    </li>
  );
}
