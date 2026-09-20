import type { ReactElement } from 'react';
import type { BookNotes } from '@taking-book/core';
import type { Annotation, BookFile } from '../../shared/types';
import { NoteCard } from '../reader/NoteCard';

interface BookNotesSectionProps extends BookNotes {
  /** Called when the reader chooses a Note, to open this book at it. */
  onOpenNote: (file: BookFile, note: Annotation) => void;
}

/** One book's heading followed by its Notes, as listed in the Notes view. */
export function BookNotesSection({ file, notes, onOpenNote }: BookNotesSectionProps): ReactElement {
  return (
    <section aria-label={file.title} className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{file.title}</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {notes.map((note) => (
          <NoteCard key={note.id} annotation={note} onJump={(annotation) => onOpenNote(file, annotation)} />
        ))}
      </ul>
    </section>
  );
}
