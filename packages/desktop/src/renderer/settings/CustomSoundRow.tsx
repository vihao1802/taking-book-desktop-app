import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { CustomSound, Result } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CustomSoundRowProps {
  sound: CustomSound;
  onRename: (contentHash: string, name: string) => Promise<Result<void>>;
  onDelete: (contentHash: string) => Promise<Result<void>>;
}

/** One Custom sound in Settings: its name, with buttons to rename or delete it. */
export function CustomSoundRow({ sound, onRename, onDelete }: CustomSoundRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startRenaming = (): void => {
    setError(null);
    setDraft(sound.name);
  };
  const stopRenaming = (): void => setDraft(null);
  const saveName = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (draft === null) return;
    const res = await onRename(sound.contentHash, draft);
    if (res.ok) {
      setError(null);
      stopRenaming();
    } else {
      setError(res.error);
    }
  };
  const deleteSound = async (): Promise<void> => {
    const res = await onDelete(sound.contentHash);
    if (!res.ok) setError(res.error);
  };

  return (
    <li className="flex flex-col gap-1">
      {draft === null ? (
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{sound.name}</span>
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" onClick={startRenaming} aria-label={`Rename ${sound.name}`}>
              <Pencil />
            </Button>
            <Button size="icon" variant="ghost" onClick={deleteSound} aria-label={`Delete ${sound.name}`}>
              <Trash2 />
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={saveName} className="flex items-center gap-2">
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={`New name for ${sound.name}`} autoFocus />
          <Button size="icon" variant="ghost" type="submit" aria-label="Save name">
            <Check />
          </Button>
          <Button size="icon" variant="ghost" type="button" onClick={stopRenaming} aria-label="Cancel renaming">
            <X />
          </Button>
        </form>
      )}
      {error !== null && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </li>
  );
}
