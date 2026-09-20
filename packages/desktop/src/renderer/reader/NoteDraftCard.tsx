import { useEffect, useRef } from 'react';
import { isPageNote } from '@taking-book/core';
import { HighlightColorPicker } from './HighlightColorPicker';
import { NoteCardButtons } from './NoteCardButtons';
import { NoteCardShell } from './NoteCardShell';
import { NoteTextBox } from './NoteTextBox';
import type { NoteDraftState } from './useNoteDraft';

interface NoteDraftCardProps {
  /** The reader's draft state; the card is only rendered while `state.draft` is set. */
  state: NoteDraftState;
}

/**
 * The card at the top of the Notes sidebar where a Note is written. It shows
 * the selected passage, a color picker, and a multi-line text box that takes
 * focus straight away. A Page note has no passage or color, so its card is just
 * the page and the text box. Cmd/Ctrl+Enter or Save stores the Note; Escape or Cancel
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

  const pageNote = isPageNote(draft);
  const kindLabel = pageNote ? 'page note' : 'note';

  return (
    <NoteCardShell
      cardRef={cardRef}
      label={`New ${kindLabel}`}
      header={`New ${kindLabel} · Page ${draft.page}`}
      quote={pageNote ? null : { text: draft.quote, color: draft.color }}
      onSave={() => void save()}
      onCancel={cancel}
    >
      <NoteTextBox value={draft.text} onChange={changeText} />
      {!pageNote && <HighlightColorPicker value={draft.color} onChange={changeColor} />}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          Couldn&apos;t save this {kindLabel}: {error}
        </p>
      )}
      <div className="flex justify-end">
        <NoteCardButtons disabled={saving} onCancel={cancel} onSave={() => void save()} />
      </div>
    </NoteCardShell>
  );
}
