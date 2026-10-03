import { hasNoteText, isPageNote } from '@taking-book/core';
import { Pencil } from 'lucide-react';
import type { Annotation } from '@/reader-api';
import { Button } from '@/components/ui/button';
import { HIGHLIGHT_FILL } from './highlights';

interface NoteCardProps {
  annotation: Annotation;
  /** True for the card the reader arrived at (from the Notes view); it gets the same accent border as a card in edit mode. */
  selected?: boolean;
  /** Called when the reader clicks the card, to jump to where the Note was written; without it the card is not clickable. */
  onJump?: (annotation: Annotation) => void;
  /**
   * Called when the reader asks to edit the Note. Shown as a pencil beside the
   * card, so a Note can be edited (and deleted, from its edit card) without
   * finding its Highlight on the page; without it the card offers no edit control.
   */
  onEdit?: (annotation: Annotation) => void;
}

const CARD_CLASS = 'bg-background/40 flex h-full w-full flex-col gap-1.5 rounded-md border p-2.5 text-left';
const CARD_BORDER_CLASS = 'border-border/60';
const SELECTED_CARD_BORDER_CLASS = 'border-primary/60';

/**
 * One entry of the Notes sidebar: the page it was written on, the passage it
 * quotes, the note text and the highlight color. A Highlight without note text
 * (shown only when the sidebar's filter asks for it) has no text block. With an
 * `onJump` the whole card is one button that jumps to the Note; its parts are
 * spans because a button may only hold phrasing content, which is also why the
 * edit pencil is a sibling of that button rather than inside it.
 */
export function NoteCard({ annotation, selected = false, onJump, onEdit }: NoteCardProps) {
  const hasQuote = !isPageNote(annotation);
  const cardClass = `${CARD_CLASS} ${selected ? SELECTED_CARD_BORDER_CLASS : CARD_BORDER_CLASS}`;

  const content = (
    <>
      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {hasQuote && (
          <span
            role="img"
            aria-label={`${annotation.color} highlight`}
            title={`${annotation.color} highlight`}
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: HIGHLIGHT_FILL[annotation.color] }}
          />
        )}
        <span>Page {annotation.page}</span>
      </span>
      {hasQuote && (
        <span
          className="text-muted-foreground line-clamp-4 block border-l-2 pl-2 text-xs italic"
          style={{ borderColor: HIGHLIGHT_FILL[annotation.color] }}
        >
          {annotation.quote}
        </span>
      )}
      {hasNoteText(annotation) && <span className="block text-sm break-words whitespace-pre-wrap">{annotation.note}</span>}
    </>
  );

  return (
    <li data-note-id={annotation.id} aria-current={selected || undefined} className="relative">
      {onJump ? (
        <button
          type="button"
          onClick={() => onJump(annotation)}
          className={`${cardClass} hover:bg-accent focus-visible:ring-ring cursor-pointer outline-none focus-visible:ring-2`}
        >
          {content}
        </button>
      ) : (
        <div className={cardClass}>{content}</div>
      )}
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground absolute top-1 right-1 size-6"
          aria-label="Edit note"
          title="Edit note"
          onClick={() => onEdit(annotation)}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
    </li>
  );
}
