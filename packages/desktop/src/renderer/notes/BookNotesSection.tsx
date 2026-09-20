import type { ReactElement } from 'react';
import type { BookNotes } from '@taking-book/core';
import type { Annotation, BookFile } from '../../shared/types';
import { NoteCard } from '../reader/NoteCard';
import { NoteEditCard } from '../reader/NoteEditCard';
import type { NoteEditActions } from '../reader/useAnnotations';

interface BookNotesSectionProps extends BookNotes {
  /** Called when the reader chooses a Note, to open this book at it. */
  onOpenNote: (file: BookFile, note: Annotation) => void;
  /** Local id of the Note whose card is in edit mode; null when none is. */
  editingId: number | null;
  /** Stores edits to and deletions of the Note being edited. */
  editActions: NoteEditActions;
  onEdit: (note: Annotation) => void;
  onStopEditing: () => void;
}

/**
 * One book's heading followed by its Notes, as listed in the Notes view. Every
 * card has an edit pencil, since there is no page here to click a Highlight on;
 * the card being edited switches in place to the same edit card the reader's
 * Notes sidebar uses.
 */
export function BookNotesSection({ file, notes, onOpenNote, editingId, editActions, onEdit, onStopEditing }: BookNotesSectionProps): ReactElement {
  return (
    <section aria-label={file.title} className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{file.title}</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {notes.map((note) =>
          note.id === editingId ? (
            <NoteEditCard key={note.id} annotation={note} actions={editActions} onDone={onStopEditing} />
          ) : (
            <NoteCard key={note.id} annotation={note} onJump={(annotation) => onOpenNote(file, annotation)} onEdit={onEdit} />
          ),
        )}
      </ul>
    </section>
  );
}
