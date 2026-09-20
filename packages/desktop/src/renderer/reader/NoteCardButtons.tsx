import { Button } from '@/components/ui/button';

/** The compact size of every text button inside a Note card. */
export const NOTE_CARD_BUTTON_CLASS = 'h-auto px-2 py-1 text-xs';

interface NoteCardButtonsProps {
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/** The Cancel and Save buttons at the bottom of a Note card. */
export function NoteCardButtons({ disabled, onCancel, onSave }: NoteCardButtonsProps) {
  return (
    <div className="flex gap-2">
      <Button variant="ghost" size="sm" className={NOTE_CARD_BUTTON_CLASS} disabled={disabled} onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" className={NOTE_CARD_BUTTON_CLASS} disabled={disabled} onClick={onSave}>
        Save
      </Button>
    </div>
  );
}
