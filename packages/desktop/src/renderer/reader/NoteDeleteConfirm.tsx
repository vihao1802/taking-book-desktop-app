import { Button } from '@/components/ui/button';
import { NOTE_CARD_BUTTON_CLASS } from './NoteCardButtons';
import type { PendingDelete } from './useNoteEditor';

interface NoteDeleteConfirmProps {
  /** Which delete is waiting for an answer; see `PendingDelete`. */
  kind: Exclude<PendingDelete, null>;
  onCancel: () => void;
  onDeleteNote: () => void;
  onDeleteHighlight: () => void;
}

const QUESTIONS = { note: 'Delete this note?', either: 'What do you want to delete?' } as const;

/**
 * The inline "are you sure" row that replaces a card's buttons before something
 * the reader wrote is deleted. For a Note on a Highlight it also asks how much to
 * delete, so one trash icon covers both "just the note" and "the whole highlight".
 */
export function NoteDeleteConfirm({ kind, onCancel, onDeleteNote, onDeleteHighlight }: NoteDeleteConfirmProps) {
  return (
    <div role="alertdialog" aria-label={QUESTIONS[kind]} className="flex flex-col gap-2">
      <span className="text-xs">{QUESTIONS[kind]}</span>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" className={NOTE_CARD_BUTTON_CLASS} onClick={onCancel}>
          Cancel
        </Button>
        {kind === 'note' ? (
          <Button variant="destructive" size="sm" className={NOTE_CARD_BUTTON_CLASS} onClick={onDeleteNote}>
            Delete
          </Button>
        ) : (
          <>
            <Button variant="destructive" size="sm" className={NOTE_CARD_BUTTON_CLASS} onClick={onDeleteNote}>
              Note only
            </Button>
            <Button variant="destructive" size="sm" className={NOTE_CARD_BUTTON_CLASS} onClick={onDeleteHighlight}>
              Highlight and note
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
