import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Annotation } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AnnotationPopupProps {
  annotation: Annotation;
  x: number;
  y: number;
  onSaveNote: (note: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Popover over a highlight to read, edit, or delete its note. */
export function AnnotationPopup({
  annotation,
  x,
  y,
  onSaveNote,
  onDelete,
  onClose,
}: AnnotationPopupProps) {
  const [draft, setDraft] = useState(annotation.note ?? '');

  const save = () => {
    onSaveNote(draft.trim().length > 0 ? draft.trim() : null);
    onClose();
  };

  return (
    <div
      className="bg-overlay text-foreground fixed z-50 flex w-72 flex-col gap-2 rounded-lg p-3 shadow-xl backdrop-blur-md"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note…"
        autoFocus
        aria-label="Note"
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive h-auto px-2 py-1 text-xs"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" className="h-auto px-2 py-1 text-xs" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}