import { hasNoteText, isPageNote } from '@taking-book/core';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Annotation } from '../../shared/types';
import { HighlightColorPicker } from './HighlightColorPicker';
import { NoteCardShell } from './NoteCardShell';
import { NoteDeleteConfirm } from './NoteDeleteConfirm';
import { NoteEditFooter } from './NoteEditFooter';
import { NoteTextBox } from './NoteTextBox';
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
 * A Note card in edit mode, in the Notes sidebar or the Notes view. The text and highlight color of the Note
 * change in place; Cmd/Ctrl+Enter or Save stores the text and Escape or Cancel
 * closes the card. Both delete controls are trash-can icons: the one beside the
 * text deletes the Note (keeping its Highlight), the one beside the colors
 * deletes the Highlight itself. Deleting written text asks first, inline.
 */
export function NoteEditCard({ annotation, actions, onDone }: NoteEditCardProps) {
  const editor = useNoteEditor({ annotation, actions, onDone });
  const { pendingDelete, busy, error } = editor;
  const hasQuote = !isPageNote(annotation);

  return (
    <NoteCardShell
      label="Edit note"
      header={`Page ${annotation.page}`}
      quote={hasQuote ? { text: annotation.quote, color: annotation.color } : null}
      noteId={annotation.id}
      onSave={editor.save}
      onCancel={pendingDelete ? editor.cancelDelete : onDone}
    >
      <NoteTextBox value={editor.text} onChange={editor.changeText} />
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
        <NoteDeleteConfirm question={DELETE_QUESTIONS[pendingDelete]} onCancel={editor.cancelDelete} onConfirm={editor.confirmDelete} />
      ) : (
        <NoteEditFooter
          canDeleteNote={hasNoteText(annotation)}
          busy={busy}
          onDeleteNote={editor.requestDeleteNote}
          onCancel={onDone}
          onSave={editor.save}
        />
      )}
    </NoteCardShell>
  );
}
