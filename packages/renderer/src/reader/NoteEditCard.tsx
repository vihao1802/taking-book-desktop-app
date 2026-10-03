import { hasNoteText, isPageNote } from '@taking-book/core';
import type { Annotation } from '@/reader-api';
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

function getDeleteLabel(annotation: Annotation): string {
  if (!hasNoteText(annotation)) return 'Delete highlight';
  return isPageNote(annotation) ? 'Delete note' : 'Delete note or highlight';
}

/**
 * A Note card in edit mode, in the Notes sidebar or the Notes view. The text and highlight color of the Note
 * change in place; Cmd/Ctrl+Enter or Save stores the text and Escape or Cancel
 * closes the card. The one trash-can icon deletes the Note or the whole
 * Highlight: a Highlight with written text asks which of the two, a Page note
 * asks to confirm, and a plain Highlight goes at once.
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
      {hasQuote && <HighlightColorPicker value={annotation.color} onChange={editor.changeColor} disabled={busy} />}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          Couldn&apos;t update this note: {error}
        </p>
      )}
      {pendingDelete ? (
        <NoteDeleteConfirm
          kind={pendingDelete}
          onCancel={editor.cancelDelete}
          onDeleteNote={editor.confirmDeleteNote}
          onDeleteHighlight={editor.confirmDeleteHighlight}
        />
      ) : (
        <NoteEditFooter
          deleteLabel={getDeleteLabel(annotation)}
          busy={busy}
          onDelete={editor.requestDelete}
          onCancel={onDone}
          onSave={editor.save}
        />
      )}
    </NoteCardShell>
  );
}
