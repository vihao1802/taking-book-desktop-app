import { Button } from '@/components/ui/button';
import { NOTE_CARD_BUTTON_CLASS } from './NoteCardButtons';

interface NoteDeleteConfirmProps {
  question: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** The inline "are you sure" row that replaces a card's buttons before something the reader wrote is deleted. */
export function NoteDeleteConfirm({ question, onCancel, onConfirm }: NoteDeleteConfirmProps) {
  return (
    <div role="alertdialog" aria-label={question} className="flex items-center justify-between gap-2">
      <span className="text-xs">{question}</span>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className={NOTE_CARD_BUTTON_CLASS} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" className={NOTE_CARD_BUTTON_CLASS} onClick={onConfirm}>
          Delete
        </Button>
      </div>
    </div>
  );
}
