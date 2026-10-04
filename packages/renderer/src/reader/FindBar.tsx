import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PageTextsProgress } from './usePageTexts';
import { withShortcutHint } from './shortcutHint';

interface FindBarProps {
  query: string;
  /** Index of the current match, or -1 when there is none. */
  activeIndex: number;
  matchCount: number;
  /** Set while page text is still being extracted, so "no results" is not premature. */
  indexing: PageTextsProgress | null;
  /** Bumps whenever the field should take focus and select its text. */
  focusRequest: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

function statusText({ query, activeIndex, matchCount, indexing }: FindBarProps): string {
  if (query.trim() === '') return '';
  if (matchCount > 0) return `${activeIndex + 1} of ${matchCount}`;
  if (indexing) return `Searching… ${Math.round((indexing.done / indexing.total) * 100)}%`;
  return 'No results';
}

/**
 * Floating find bar for the reader: query field, match counter and prev/next.
 * Enter and Shift+Enter step through matches; Escape and the reader-wide Ctrl/Cmd+F
 * are handled by the shared shortcut hook, not here.
 */
export function FindBar(props: FindBarProps) {
  const { query, focusRequest, onQueryChange, onNext, onPrevious, onClose, matchCount } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  return (
    <div
      role="search"
      className="bg-popover text-popover-foreground pointer-events-auto flex flex-wrap items-center gap-1 rounded-md border p-1.5 shadow-md compact:w-full"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (e.shiftKey) onPrevious();
          else onNext();
        }}
        placeholder="Find in document"
        aria-label="Find in document"
        className="h-8 w-56 text-sm compact:w-full compact:basis-full"
      />
      <span
        className="text-muted-foreground min-w-[9ch] flex-1 text-center text-xs tabular-nums"
        aria-live="polite"
      >
        {statusText(props)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={matchCount === 0}
        onClick={onPrevious}
        aria-label="Previous match"
        title={withShortcutHint('Previous match', 'findPrevious')}
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={matchCount === 0}
        onClick={onNext}
        aria-label="Next match"
        title={withShortcutHint('Next match', 'findNext')}
      >
        <ChevronDown className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onClose}
        aria-label="Close find bar"
        title={withShortcutHint('Close', 'dismiss')}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
