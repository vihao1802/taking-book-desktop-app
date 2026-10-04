import { Timer } from 'lucide-react';
import { formatFocusTimeLeft } from '@taking-book/core';
import { AdaptivePopover } from '@/components/AdaptivePopover';
import { Button } from '@/components/ui/button';
import { hasFocusControls, useCapabilities } from '@/lib/useCapabilities';
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
  const capabilities = useCapabilities();

  if (!hasFocusControls(capabilities)) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size={timeLeftMs === null ? 'icon' : 'sm'}
        onClick={() => onOpenChange(!open)}
        aria-label="Focus controls"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Focus controls"
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
        <AdaptivePopover
          label="Focus controls"
          onClose={() => onOpenChange(false)}
          anchoredClassName="top-full right-0 mt-1.5 w-72 p-3"
        >
          <FocusControlsPanel />
        </AdaptivePopover>
      )}
    </div>
  );
}
