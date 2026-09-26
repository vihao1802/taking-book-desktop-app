import { Pause, Play, Square } from 'lucide-react';
import { formatFocusTimeLeft } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { useFocus } from './useFocus';

/** The running or paused Focus timer: its time left, with pause, resume and stop. */
export function FocusTimerCountdown() {
  const { timer, timeLeftMs, pause, resume, stop } = useFocus();
  const paused = timer.status === 'paused';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-col items-center">
        <span className="text-3xl font-semibold tabular-nums">{formatFocusTimeLeft(timeLeftMs ?? 0)}</span>
        <span className="text-muted-foreground text-xs">{paused ? 'Paused' : 'Time left'}</span>
      </div>
      <div className="grid w-full grid-cols-2 gap-1.5">
        {paused ? (
          <Button size="sm" onClick={() => resume()}>
            <Play />
            Resume
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => pause()}>
            <Pause />
            Pause
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => stop()}>
          <Square />
          Stop
        </Button>
      </div>
    </div>
  );
}
