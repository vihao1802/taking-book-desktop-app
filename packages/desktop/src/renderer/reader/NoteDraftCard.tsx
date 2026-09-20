import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { HighlightColorPicker } from './HighlightColorPicker';
import { HIGHLIGHT_FILL } from './highlights';
import { resolveNoteDraftKey } from './note-draft-keys';
import type { NoteDraftState } from './useNoteDraft';

interface NoteDraftCardProps {
  /** The reader's draft state; the card is only rendered while `state.draft` is set. */
  state: NoteDraftState;
}

/**
 * The card at the top of the Notes sidebar where a Note is written. It shows
 * the selected passage, a color picker, and a multi-line text box that takes
 * focus straight away. Cmd/Ctrl+Enter or Save stores the Note; Escape or Cancel
 * throws the draft away, so nothing is kept until the reader saves.
 */
export function NoteDraftCard({ state }: NoteDraftCardProps) {
  const { draft, saving, error, changeText, changeColor, cancel, save } = state;
  const cardRef = useRef<HTMLLIElement>(null);

  // The list may be scrolled down when "Add note" is chosen; the draft must be in view to be typed into.
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  if (!draft) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = resolveNoteDraftKey(event.nativeEvent);
    if (action === null) return;
    // Escape would otherwise also close the reader's layers underneath (sidebar, then reader).
    event.preventDefault();
    event.stopPropagation();
    if (action === 'save') void save();
    else cancel();
  };

  return (
    <li
      ref={cardRef}
      aria-label="New note"
      className="border-primary/60 bg-background/60 flex flex-col gap-2 rounded-md border p-2.5"
    >
      <div className="text-muted-foreground text-xs">New note · Page {draft.page}</div>
      <blockquote
        className="text-muted-foreground line-clamp-4 border-l-2 pl-2 text-xs italic"
        style={{ borderColor: HIGHLIGHT_FILL[draft.color] }}
      >
        {draft.quote}
      </blockquote>
      <textarea
        autoFocus
        rows={4}
        value={draft.text}
        onChange={(event) => changeText(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write a note…"
        aria-label="Note text"
        className="border-input bg-secondary/50 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 w-full resize-y rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-[3px]"
      />
      <HighlightColorPicker value={draft.color} onChange={changeColor} />
      {error && (
        <p role="alert" className="text-destructive text-xs">
          Couldn&apos;t save this note: {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" disabled={saving} onClick={cancel}>
          Cancel
        </Button>
        <Button size="sm" className="h-auto px-2 py-1 text-xs" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </li>
  );
}
