import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parsePageNumber } from './parsePageNumber';

interface GoToPageBarProps {
  total: number;
  currentPage: number;
  onGoTo: (page: number) => void;
  onClose: () => void;
}

/**
 * Floating "go to page" field. Mounted on demand (remounted per request) so
 * it always opens focused with the current page selected; Enter jumps and
 * closes, Escape is handled by the shared shortcut hook.
 */
export function GoToPageBar({ total, currentPage, onGoTo, onClose }: GoToPageBarProps) {
  const [draft, setDraft] = useState(String(currentPage));
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Listens on window in the capture phase because the overlay and the page
  // stop pointerdown from bubbling, so a bubbling listener would miss most
  // outside clicks. The click still reaches its target; this only closes.
  useEffect(() => {
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && dialogRef.current?.contains(event.target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
  }, [onClose]);

  const submit = () => {
    const page = parsePageNumber(draft, total);
    if (page === null) {
      setInvalid(true);
      return;
    }
    onGoTo(page);
    onClose();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Go to page"
      className="bg-popover text-popover-foreground pointer-events-auto flex items-center gap-2 rounded-md border p-1.5 shadow-md"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground pl-1.5 text-xs font-semibold">Go to page</span>
      <Input
        ref={inputRef}
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          submit();
        }}
        aria-label="Page number"
        aria-invalid={invalid}
        className={cn('h-8 w-16 text-center text-sm tabular-nums', invalid && 'border-destructive')}
      />
      <span className="text-muted-foreground text-xs font-semibold tabular-nums">of {total}</span>
      <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close go to page">
        <X className="size-4" />
      </Button>
    </div>
  );
}
