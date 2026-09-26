import { createContext } from 'react';
import type { FocusError, FocusTimer, Result } from '@taking-book/core';

export interface FocusContextValue {
  timer: FocusTimer;
  /** Time left on the Focus timer, refreshed about once a second; null when none is running or paused. */
  timeLeftMs: number | null;
  /** Starts a Focus timer, replacing any running one; fails for a length outside the Focus timer rules. */
  start: (minutes: number) => Result<void, FocusError>;
  pause: () => void;
  resume: () => void;
  /** Stops the Focus timer by hand, silently. */
  stop: () => void;
}

export const FocusContext = createContext<FocusContextValue | null>(null);
