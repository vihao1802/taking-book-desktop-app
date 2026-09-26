import { useEffect, useState, type ReactElement } from 'react';
import { Timer } from 'lucide-react';
import { formatFocusTimeLeft, isFocusActive } from '@taking-book/core';
import { cn } from '@/lib/utils';
import { FocusControlsPanel } from './FocusControlsPanel';
import { useFocus } from './useFocus';

/**
 * The navigation rail's Focus indicator: shown only while a Focus timer or
 * Ambient sound is active, with the timer's time left, and opening the same
 * Focus controls as the reader's Overlay. It is the only entry point outside
 * the reader, which hides the rail.
 */
export function FocusIndicator(): ReactElement | null {
  const { timer, sound, timeLeftMs } = useFocus();
  const [open, setOpen] = useState(false);
  const active = isFocusActive({ timer, sound });

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  // The indicator leaves when the last thing ends; drop a stale open popover with it.
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  if (!active) return null;

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-20" aria-hidden onClick={() => setOpen(false)} />}
      <button
        className={cn(
          'text-muted-foreground hover:bg-card flex w-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors',
          open && 'bg-card text-ink shadow-sm',
        )}
        aria-label="Focus controls"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Focus controls"
        onClick={() => setOpen(!open)}
      >
        <Timer className="size-5" />
        {timeLeftMs !== null && (
          <span className={cn('text-xs tabular-nums', timer.status === 'paused' && 'opacity-60')}>
            {formatFocusTimeLeft(timeLeftMs)}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Focus controls"
          className="bg-popover text-popover-foreground absolute bottom-0 left-full z-30 ml-2 w-72 rounded-md border p-3 shadow-md"
        >
          <FocusControlsPanel />
        </div>
      )}
    </div>
  );
}
