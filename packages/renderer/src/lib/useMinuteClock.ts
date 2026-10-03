import { useEffect, useState } from 'react';
import { msUntilNextMinute } from '@taking-book/core';

/**
 * The current time, re-rendering the caller on every minute rollover. Timers
 * pause while the machine sleeps and are throttled while the window is hidden,
 * so the clock is also re-read, and the next tick re-aimed, whenever the window
 * is shown or focused again; otherwise it could show a stale time for up to a
 * minute after waking.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const tick = (): void => {
      window.clearTimeout(timer);
      setNow(new Date());
      timer = window.setTimeout(tick, msUntilNextMinute(new Date()));
    };
    const tickWhenVisible = (): void => {
      if (document.visibilityState === 'visible') tick();
    };
    timer = window.setTimeout(tick, msUntilNextMinute(new Date()));
    document.addEventListener('visibilitychange', tickWhenVisible);
    window.addEventListener('focus', tick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', tickWhenVisible);
      window.removeEventListener('focus', tick);
    };
  }, []);

  return now;
}
