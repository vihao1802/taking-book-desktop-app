import { hasNoteText, isPageNote } from '@taking-book/core';
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
 * closes the card. The one trash-can icon deletes the Note while there is text
 * (keeping its Highlight, or removing a Page note entirely) and, once a Highlight
 * has none, the Highlight itself. Deleting written text asks first, inline.
 */
export function NoteEditCard({ annotation, actions, onDone }: NoteEditCardProps) {
  const editor = useNoteEditor({ annotation, actions, onDone });
  const { pendingDelete, busy, error } = editor;
  const hasQuote = !isPageNote(annotation);
  const holdsNote = hasNoteText(annotation);

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
        <NoteDeleteConfirm question={DELETE_QUESTIONS[pendingDelete]} onCancel={editor.cancelDelete} onConfirm={editor.confirmDelete} />
      ) : (
        <NoteEditFooter
          deleteTarget={holdsNote ? 'note' : 'highlight'}
          busy={busy}
          onDelete={holdsNote ? editor.requestDeleteNote : editor.requestDeleteHighlight}
          onCancel={onDone}
          onSave={editor.save}
        />
      )}
    </NoteCardShell>
  );
}
