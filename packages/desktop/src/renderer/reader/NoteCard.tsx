import type { Annotation } from '../../shared/types';
import { HIGHLIGHT_FILL } from './highlights';

interface NoteCardProps {
  annotation: Annotation;
}

/**
 * One entry of the Notes sidebar: the page it was written on, the passage it
 * quotes, the note text and the highlight color. A Highlight without note text
 * (shown only when the sidebar's filter asks for it) has no text block.
 */
export function NoteCard({ annotation }: NoteCardProps) {
  const hasQuote = annotation.quote.trim().length > 0;
  const hasText = annotation.note !== null && annotation.note.trim().length > 0;

  return (
    <li className="border-border/60 bg-background/40 flex flex-col gap-1.5 rounded-md border p-2.5">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
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
      </div>
      {hasQuote && (
        <blockquote
          className="text-muted-foreground line-clamp-4 border-l-2 pl-2 text-xs italic"
          style={{ borderColor: HIGHLIGHT_FILL[annotation.color] }}
        >
          {annotation.quote}
        </blockquote>
      )}
      {hasText && <p className="text-sm break-words whitespace-pre-wrap">{annotation.note}</p>}
    </li>
  );
}
