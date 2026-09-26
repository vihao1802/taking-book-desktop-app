import { useRef } from 'react';
import { Highlighter, Languages, MessageSquarePlus } from 'lucide-react';
import type { AnnotationColor } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HIGHLIGHT_COLORS, HIGHLIGHT_FILL } from './highlights';
import { useHighlightColorChoice } from './useHighlightColorChoice';
import { useFloatingPosition } from './useFloatingPosition';
import type { SelectionAnchor } from './floating-placement';

interface SelectionToolbarProps {
  anchor: SelectionAnchor;
  onHighlight: (color: AnnotationColor) => void;
  onAddNote: () => void;
  onTranslate: () => void;
}

/**
 * Floating toolbar shown over selected text: a Highlight button that opens the
 * color choice, Add note, and Translate. The colors sit behind one button so the toolbar
 * stays compact and has room for further selection actions. It opens below the
 * selection and stays inside the window, flipping above the selection when
 * there is no room below.
 */
export function SelectionToolbar({ anchor, onHighlight, onAddNote, onTranslate }: SelectionToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const colors = useHighlightColorChoice(rootRef, anchor);
  const position = useFloatingPosition(rootRef, anchor);

  return (
    <div
      ref={rootRef}
      className="bg-overlay text-foreground fixed z-50 flex flex-col items-start gap-1 rounded-lg px-2 py-1.5 shadow-lg backdrop-blur-md"
      style={{ left: position.left, top: position.top, visibility: position.measured ? 'visible' : 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-7 cursor-pointer rounded-md', colors.open && 'bg-accent text-accent-foreground')}
          onClick={colors.toggle}
          aria-label="Highlight"
          aria-expanded={colors.open}
          title="Highlight"
        >
          <Highlighter className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 cursor-pointer rounded-md"
          onClick={onAddNote}
          aria-label="Add note"
          title="Add note"
        >
          <MessageSquarePlus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 cursor-pointer rounded-md"
          onClick={onTranslate}
          aria-label="Translate"
          title="Translate"
        >
          <Languages className="size-4" />
        </Button>
      </div>
      {colors.open && (
        <div role="group" aria-label="Highlight colors" className="flex items-center gap-1 px-1 pb-0.5">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Highlight in ${color}`}
              title={color}
              onClick={() => onHighlight(color)}
              className="size-5 cursor-pointer rounded-sm border border-black/20 transition-transform hover:scale-110"
              style={{ backgroundColor: HIGHLIGHT_FILL[color] }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
