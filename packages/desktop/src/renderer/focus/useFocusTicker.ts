import { useEffect } from 'react';
import type { FocusTimer } from '@taking-book/core';

// Often enough that the shown seconds never visibly lag a real second.
const DISPLAY_TICK_MS = 250;

/**
 * Ticks a running Focus timer. Timers are throttled while the window is in the
 * background, so the countdown never relies on the tick count: every tick is
 * measured against the end time. A one-shot timeout aimed at the end time
 * also fires the run-out promptly, because background throttling slows a
 * repeating interval far more than a single timeout, and the window
 * regaining visibility or focus ticks straight away.
 */
export function useFocusTicker(timer: FocusTimer, onTick: () => void): void {
  const endsAt = timer.status === 'running' ? timer.endsAt : null;

  useEffect(() => {
    if (endsAt === null) return;
    const interval = window.setInterval(onTick, DISPLAY_TICK_MS);
    const atEnd = window.setTimeout(onTick, Math.max(0, endsAt - Date.now()));
    const tickWhenVisible = (): void => {
      if (document.visibilityState === 'visible') onTick();
    };
    document.addEventListener('visibilitychange', tickWhenVisible);
    window.addEventListener('focus', onTick);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(atEnd);
      document.removeEventListener('visibilitychange', tickWhenVisible);
      window.removeEventListener('focus', onTick);
    };
  }, [endsAt, onTick]);
}
