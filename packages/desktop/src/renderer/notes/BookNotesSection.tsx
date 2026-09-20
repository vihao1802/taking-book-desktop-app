import type { ReactElement } from 'react';
import type { BookNotes } from '@taking-book/core';
import { NoteCard } from '../reader/NoteCard';

/** One book's heading followed by its Notes, as listed in the Notes view. */
export function BookNotesSection({ file, notes }: BookNotes): ReactElement {
  return (
    <section aria-label={file.title} className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{file.title}</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {notes.map((note) => (
          <NoteCard key={note.id} annotation={note} />
        ))}
      </ul>
    </section>
  );
}
