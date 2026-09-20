import { hasNoteText, isPageNote } from '@taking-book/core';
import { Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { Annotation } from '../../shared/types';
import { HighlightColorPicker } from './HighlightColorPicker';
import { HIGHLIGHT_FILL } from './highlights';
import { resolveNoteDraftKey } from './note-draft-keys';
import type { NoteEditActions } from './useAnnotations';
import { useNoteEditor } from './useNoteEditor';

interface NoteEditCardProps {
  annotation: Annotation;
  actions: NoteEditActions;
  /** Called when editing ends: saved, deleted or cancelled. */
  onDone: () => void;
}

const DELETE_QUESTIONS = { note: 'Delete this note?', highlight: 'Delete this highlight and its note?' } as const;

/**
 * A Notes sidebar card in edit mode. The text and highlight color of the Note
 * change in place; Cmd/Ctrl+Enter or Save stores the text and Escape or Cancel
 * closes the card. Both delete controls are trash-can icons: the one beside the
 * text deletes the Note (keeping its Highlight), the one beside the colors
 * deletes the Highlight itself. Deleting written text asks first, inline.
 */
export function NoteEditCard({ annotation, actions, onDone }: NoteEditCardProps) {
  const editor = useNoteEditor({ annotation, actions, onDone });
  const { text, pendingDelete, busy, error } = editor;
  const hasQuote = !isPageNote(annotation);

  // Handled on the card, not the text box, so Escape also works from a swatch or a trash button.
  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    const action = resolveNoteDraftKey(event.nativeEvent);
    if (action === null) return;
    // Escape would otherwise also close the reader's layers underneath (sidebar, then reader).
    event.preventDefault();
    event.stopPropagation();
    if (action === 'save') editor.save();
    else if (pendingDelete) editor.cancelDelete();
    else onDone();
  };

  return (
    <li
      data-note-id={annotation.id}
      aria-label="Edit note"
      onKeyDown={handleKeyDown}
      className="border-primary/60 bg-background/60 flex flex-col gap-2 rounded-md border p-2.5"
    >
      <div className="text-muted-foreground text-xs">Page {annotation.page}</div>
      {hasQuote && (
        <blockquote
          className="text-muted-foreground line-clamp-4 border-l-2 pl-2 text-xs italic"
          style={{ borderColor: HIGHLIGHT_FILL[annotation.color] }}
        >
          {annotation.quote}
        </blockquote>
      )}
      <textarea
        autoFocus
        rows={4}
        value={text}
        onChange={(event) => editor.changeText(event.target.value)}
        placeholder="Write a note…"
        aria-label="Note text"
        className="border-input bg-secondary/50 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px]"
      />
      {hasQuote && (
        <div className="flex items-center justify-between gap-2">
          <HighlightColorPicker value={annotation.color} onChange={editor.changeColor} disabled={busy} />
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7"
            aria-label="Delete highlight"
            title="Delete highlight"
            disabled={busy}
            onClick={editor.requestDeleteHighlight}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          Couldn&apos;t update this note: {error}
        </p>
      )}
      {pendingDelete ? (
        <div role="alertdialog" aria-label={DELETE_QUESTIONS[pendingDelete]} className="flex items-center justify-between gap-2">
          <span className="text-xs">{DELETE_QUESTIONS[pendingDelete]}</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={editor.cancelDelete}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="h-auto px-2 py-1 text-xs" onClick={editor.confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          {hasNoteText(annotation) ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7"
              aria-label="Delete note"
              title="Delete note"
              disabled={busy}
              onClick={editor.requestDeleteNote}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" disabled={busy} onClick={onDone}>
              Cancel
            </Button>
            <Button size="sm" className="h-auto px-2 py-1 text-xs" disabled={busy} onClick={editor.save}>
              Save
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
