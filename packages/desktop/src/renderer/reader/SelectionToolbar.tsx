import { MessageSquarePlus } from 'lucide-react';
import type { AnnotationColor } from '../../shared/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HIGHLIGHT_COLORS, HIGHLIGHT_FILL } from './highlights';

interface SelectionToolbarProps {
  x: number;
  y: number;
  onHighlight: (color: AnnotationColor) => void;
  onComment: () => void;
}

/** Floating toolbar shown over selected text: pick a highlight color or comment. */
export function SelectionToolbar({ x, y, onHighlight, onComment }: SelectionToolbarProps) {
  return (
    <div
      className="bg-overlay text-foreground fixed z-50 flex items-center gap-1 rounded-lg px-2 py-1.5 shadow-lg backdrop-blur-md"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
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
      <Button
        variant="ghost"
        size="icon"
        className={cn('size-7 cursor-pointer rounded-md')}
        onClick={onComment}
        aria-label="Add comment"
        title="Add comment"
      >
        <MessageSquarePlus className="size-4" />
      </Button>
    </div>
  );
}