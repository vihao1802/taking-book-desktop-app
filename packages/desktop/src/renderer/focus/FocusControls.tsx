import { Timer } from 'lucide-react';
import { formatFocusTimeLeft } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FocusControlsPanel } from './FocusControlsPanel';
import { useFocus } from './useFocus';

interface FocusControlsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The Overlay's Focus controls icon, which shows the Focus timer's time left
 * beside it, and the popover it opens. The Overlay owns `open` so its shared
 * click-away backdrop can close the popover.
 */
export function FocusControls({ open, onOpenChange }: FocusControlsProps) {
  const { timer, timeLeftMs } = useFocus();

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size={timeLeftMs === null ? 'icon' : 'sm'}
        onClick={() => onOpenChange(!open)}
        aria-label="Focus controls"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Focus timer"
        className={cn(open && 'bg-accent text-accent-foreground')}
      >
        <Timer className="size-4" />
        {timeLeftMs !== null && (
          <span className={cn('text-xs tabular-nums', timer.status === 'paused' && 'text-muted-foreground')}>
            {formatFocusTimeLeft(timeLeftMs)}
          </span>
        )}
      </Button>
      {open && (
        <div
          role="dialog"
          aria-label="Focus controls"
          className="bg-popover text-popover-foreground absolute top-full right-0 z-30 mt-1.5 w-64 rounded-md border p-3 shadow-md"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <FocusControlsPanel />
        </div>
      )}
    </div>
  );
}
