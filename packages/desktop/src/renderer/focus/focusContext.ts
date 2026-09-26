import { createContext } from 'react';
import type { AmbientSoundState, CustomSound, FocusError, FocusTimer, Result } from '@taking-book/core';
import type { CustomSoundsNotice } from './custom-sound-messages';

export interface FocusContextValue {
  timer: FocusTimer;
  /** Time left on the Focus timer, refreshed about once a second; null when none is running or paused. */
  timeLeftMs: number | null;
  /** Starts a Focus timer, replacing any running one; fails for a length outside the Focus timer rules. */
  start: (minutes: number) => Result<void, FocusError>;
  /** The Focus timer length last chosen, in whole minutes; the default until the saved one has loaded. */
  lengthMinutes: number;
  /** Selects and remembers a Focus timer length; it does not start the timer. */
  chooseLength: (minutes: number) => void;
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
  /** The reader's Custom sounds, in the order they were added; they are listed after the bundled sounds. */
  customSounds: CustomSound[];
  /** What the last attempt to add Custom sounds did, for the reader; null when there is nothing to say. */
  customSoundsNotice: CustomSoundsNotice | null;
  /** Asks for audio files and adds them as Custom sounds. */
  addCustomSounds: () => Promise<void>;
  renameCustomSound: (contentHash: string, name: string) => Promise<Result<void>>;
  /** Deletes a Custom sound; if it is the one playing or chosen, it stops and the choice is cleared. */
  deleteCustomSound: (contentHash: string) => Promise<Result<void>>;
  /** Sets the one volume, from 0 to 1, that every Ambient sound shares. */
  setVolume: (volume: number) => void;
}

export const FocusContext = createContext<FocusContextValue | null>(null);
