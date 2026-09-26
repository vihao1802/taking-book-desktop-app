import { createContext } from 'react';
import type { AmbientSoundState, FocusError, FocusTimer, Result } from '@taking-book/core';

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
  sound: AmbientSoundState;
  /** A short message about the last Ambient sound failure, cleared when a sound next plays; null when there is none. */
  soundError: string | null;
  /** Plays a sound from the catalog, replacing the one playing. */
  chooseSound: (soundId: string) => void;
  stopSound: () => void;
  /** Sets the one volume, from 0 to 1, that every Ambient sound shares. */
  setVolume: (volume: number) => void;
}

export const FocusContext = createContext<FocusContextValue | null>(null);
