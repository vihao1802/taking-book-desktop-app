import type { FocusContextValue } from './focusContext';

/** Test helper: a Focus context value with nothing running, so components can render without the provider. */
export const IDLE_FOCUS: FocusContextValue = {
  timer: { status: 'idle' },
  timeLeftMs: null,
  start: () => ({ ok: true, data: undefined }),
  lengthMinutes: 25,
  chooseLength: () => undefined,
  pause: () => undefined,
  resume: () => undefined,
  stop: () => undefined,
  sound: { soundId: null, volume: 0.5, status: 'stopped' },
  soundError: null,
  chooseSound: () => undefined,
  stopSound: () => undefined,
  customSounds: [],
  customSoundsNotice: null,
  addCustomSounds: () => Promise.resolve(),
  renameCustomSound: () => Promise.resolve({ ok: true, data: undefined }),
  deleteCustomSound: () => Promise.resolve({ ok: true, data: undefined }),
  setVolume: () => undefined,
};
