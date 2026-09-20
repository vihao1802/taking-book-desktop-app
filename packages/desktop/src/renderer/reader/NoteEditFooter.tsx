import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoteCardButtons } from './NoteCardButtons';

interface NoteEditFooterProps {
  /** True when the Note has text, which is what the trash icon deletes. */
  canDeleteNote: boolean;
  busy: boolean;
  onDeleteNote: () => void;
  onCancel: () => void;
  onSave: () => void;
}

/** The bottom row of a Note card in edit mode: delete-note on the left, Cancel and Save on the right. */
export function NoteEditFooter({ canDeleteNote, busy, onDeleteNote, onCancel, onSave }: NoteEditFooterProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      {canDeleteNote ? (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-7"
          aria-label="Delete note"
          title="Delete note"
          disabled={busy}
          onClick={onDeleteNote}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : (
        <span />
      )}
      <NoteCardButtons disabled={busy} onCancel={onCancel} onSave={onSave} />
    </div>
  );
}
