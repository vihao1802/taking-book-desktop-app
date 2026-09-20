import { hasNoteText } from '@taking-book/core';
import type { Annotation } from '../../shared/types';
import { HIGHLIGHT_FILL } from './highlights';

interface NoteCardProps {
  annotation: Annotation;
  /** Called when the reader clicks the card, to jump to where the Note was written; without it the card is not clickable. */
  onJump?: (annotation: Annotation) => void;
}

const CARD_CLASS = 'border-border/60 bg-background/40 flex h-full w-full flex-col gap-1.5 rounded-md border p-2.5 text-left';

/**
 * One entry of the Notes sidebar: the page it was written on, the passage it
 * quotes, the note text and the highlight color. A Highlight without note text
 * (shown only when the sidebar's filter asks for it) has no text block. With an
 * `onJump` the whole card is one button that jumps to the Note; its parts are
 * spans because a button may only hold phrasing content.
 */
export function NoteCard({ annotation, onJump }: NoteCardProps) {
  const hasQuote = annotation.quote.trim().length > 0;

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
    <li data-note-id={annotation.id}>
      {onJump ? (
        <button
          type="button"
          onClick={() => onJump(annotation)}
          className={`${CARD_CLASS} hover:bg-accent focus-visible:ring-ring cursor-pointer outline-none focus-visible:ring-2`}
        >
          {content}
        </button>
      ) : (
        <div className={CARD_CLASS}>{content}</div>
      )}
    </li>
  );
}
