import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoteCardButtons } from './NoteCardButtons';

interface NoteEditFooterProps {
  /** Accessible name and tooltip of the trash icon, saying what it can delete. */
  deleteLabel: string;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
}

/** The bottom row of a Note card in edit mode: delete on the left, Cancel and Save on the right. */
export function NoteEditFooter({ deleteLabel, busy, onDelete, onCancel, onSave }: NoteEditFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="icon" className="text-muted-foreground size-7" aria-label={deleteLabel} title={deleteLabel} disabled={busy} onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
      <NoteCardButtons disabled={busy} onCancel={onCancel} onSave={onSave} />
    </div>
  );
}
