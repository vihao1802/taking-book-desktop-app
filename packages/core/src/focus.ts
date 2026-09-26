/**
 * Focus timer and Ambient sound rules, shared by both platforms. A pure state machine: the
 * clock is passed in, and each transition returns the next state plus the
 * effects the platform must carry out. Nothing here runs timers or sound.
 */
import { err, ok, type Result } from './result';

/** Focus timer lengths offered as one-click presets, in minutes. */
export const FOCUS_PRESET_MINUTES: number[] = [15, 25, 45, 60];

/** Shortest and longest Focus timer a reader can start, in whole minutes. */
export const FOCUS_MIN_MINUTES = 1;
export const FOCUS_MAX_MINUTES = 180;

/** The length chosen when the reader has not picked one. */
export const DEFAULT_FOCUS_MINUTES = 25;

/**
 * Why a focus action was rejected: a Focus timer length outside the rules, a
 * sound id missing from the catalog, or a volume that is not a number.
 */
export type FocusError = 'invalid-length' | 'unknown-sound' | 'invalid-volume';

export type AmbientSoundKind = 'noise' | 'nature' | 'instrumental';

/** One Ambient sound the reader can choose. How to play it is up to each platform. */
export interface AmbientSound {
  /** Stable id, safe to store and to key platform audio by. */
  id: string;
  kind: AmbientSoundKind;
  name: string;
}

/** Every Ambient sound, in the order the Focus controls list them. */
export const AMBIENT_SOUNDS: AmbientSound[] = [
  { id: 'white-noise', kind: 'noise', name: 'White noise' },
  { id: 'pink-noise', kind: 'noise', name: 'Pink noise' },
  { id: 'brown-noise', kind: 'noise', name: 'Brown noise' },
];

/**
 * Looks up a sound in the catalog.
 *
 * @param id - A sound id, possibly stale or unknown.
 * @returns The sound, or null when the catalog has no sound with that id.
 */
export function getAmbientSound(id: string): AmbientSound | null {
  return AMBIENT_SOUNDS.find((sound) => sound.id === id) ?? null;
}

/** The volume, from 0 to 1, used before the reader sets one. */
export const DEFAULT_AMBIENT_VOLUME = 0.3;

/**
 * Validates a custom Focus timer length the reader typed.
 *
 * @param input - Raw text from the custom length field.
 * @returns The length in minutes, or `invalid-length` for anything that is not
 *   a whole number from 1 to 180.
 */
export function parseFocusMinutes(input: string): Result<number, FocusError> {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return err('invalid-length');
  return validateFocusMinutes(Number(trimmed));
}

function validateFocusMinutes(minutes: number): Result<number, FocusError> {
  const valid = Number.isInteger(minutes) && minutes >= FOCUS_MIN_MINUTES && minutes <= FOCUS_MAX_MINUTES;
  return valid ? ok(minutes) : err('invalid-length');
}

/**
 * The Focus timer: not started, counting down to an end time, or paused with
 * the exact time it had left.
 */
export type FocusTimer =
  | { status: 'idle' }
  | { status: 'running'; endsAt: number }
  | { status: 'paused'; remainingMs: number };

/**
 * The Ambient sound: the last sound chosen (kept after stopping, so it can be
 * shown as the reader's choice), the single volume every sound shares, and
 * whether it is playing.
 */
export interface AmbientSoundState {
  soundId: string | null;
  volume: number;
  status: 'playing' | 'stopped';
}

export interface FocusState {
  timer: FocusTimer;
  sound: AmbientSoundState;
}

export type FocusAction =
  | { type: 'start'; minutes: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'tick' }
  | { type: 'choose-sound'; soundId: string }
  | { type: 'stop-sound' }
  | { type: 'set-volume'; volume: number };

/** Work the platform carries out after a transition. */
export type FocusEffect =
  | { type: 'chime' }
  | { type: 'notify' }
  | { type: 'play-sound'; soundId: string; volume: number }
  | { type: 'stop-sound' }
  | { type: 'set-volume'; volume: number };

export interface FocusTransition {
  state: FocusState;
  effects: FocusEffect[];
}

export const INITIAL_FOCUS_STATE: FocusState = {
  timer: { status: 'idle' },
  sound: { soundId: null, volume: DEFAULT_AMBIENT_VOLUME, status: 'stopped' },
};

/**
 * Applies one action to the focus state.
 *
 * @param state - The current state.
 * @param action - What the reader (or the platform's periodic tick) did.
 * @param now - The current time in milliseconds; time is always measured
 *   against end times, so a late or throttled tick stays accurate.
 * @returns The next state and the effects to carry out, or a `FocusError`
 *   when the action breaks the Focus timer or Ambient sound rules.
 */
export function applyFocusAction(state: FocusState, action: FocusAction, now: number): Result<FocusTransition, FocusError> {
  switch (action.type) {
    case 'start':
      return startTimer(state, action.minutes, now);
    case 'pause':
      return ok(pauseTimer(state, now));
    case 'resume':
      return ok(resumeTimer(state, now));
    case 'stop':
      // A manual stop is silent: only a Focus timer that runs out is announced.
      return ok({ state: { ...state, timer: { status: 'idle' } }, effects: [] });
    case 'tick':
      return ok(tickTimer(state, now));
    case 'choose-sound':
      return chooseSound(state, action.soundId);
    case 'stop-sound':
      return ok(stopSound(state));
    case 'set-volume':
      return setVolume(state, action.volume);
  }
}

function startTimer(state: FocusState, minutes: number, now: number): Result<FocusTransition, FocusError> {
  const length = validateFocusMinutes(minutes);
  if (!length.ok) return length;
  return ok({ state: { ...state, timer: { status: 'running', endsAt: now + length.data * 60_000 } }, effects: [] });
}

function pauseTimer(state: FocusState, now: number): FocusTransition {
  const { timer } = state;
  if (timer.status !== 'running') return { state, effects: [] };
  return { state: { ...state, timer: { status: 'paused', remainingMs: timeLeftUntil(timer.endsAt, now) } }, effects: [] };
}

function resumeTimer(state: FocusState, now: number): FocusTransition {
  const { timer } = state;
  if (timer.status !== 'paused') return { state, effects: [] };
  return { state: { ...state, timer: { status: 'running', endsAt: now + timer.remainingMs } }, effects: [] };
}

function tickTimer(state: FocusState, now: number): FocusTransition {
  const { timer } = state;
  if (timer.status !== 'running' || now < timer.endsAt) return { state, effects: [] };
  return { state: { ...state, timer: { status: 'idle' } }, effects: [{ type: 'chime' }, { type: 'notify' }] };
}

// One sound plays at a time: playing a new one replaces the current one, at the shared volume.
function chooseSound(state: FocusState, soundId: string): Result<FocusTransition, FocusError> {
  if (getAmbientSound(soundId) === null) return err('unknown-sound');
  const { sound } = state;
  if (sound.status === 'playing' && sound.soundId === soundId) return ok({ state, effects: [] });
  return ok({
    state: { ...state, sound: { ...sound, soundId, status: 'playing' } },
    effects: [{ type: 'play-sound', soundId, volume: sound.volume }],
  });
}

function stopSound(state: FocusState): FocusTransition {
  if (state.sound.status !== 'playing') return { state, effects: [] };
  return { state: { ...state, sound: { ...state.sound, status: 'stopped' } }, effects: [{ type: 'stop-sound' }] };
}

function setVolume(state: FocusState, volume: number): Result<FocusTransition, FocusError> {
  if (Number.isNaN(volume)) return err('invalid-volume');
  const clamped = Math.min(1, Math.max(0, volume));
  const next = { ...state, sound: { ...state.sound, volume: clamped } };
  // A silent sound only needs the volume stored; the next play-sound carries it.
  const effects: FocusEffect[] = state.sound.status === 'playing' ? [{ type: 'set-volume', volume: clamped }] : [];
  return ok({ state: next, effects });
}

/**
 * How long the Focus timer has left, for display.
 *
 * @param timer - The Focus timer.
 * @param now - The current time in milliseconds.
 * @returns Milliseconds left (never negative), or null when no Focus timer is
 *   running or paused.
 */
export function getFocusTimeLeftMs(timer: FocusTimer, now: number): number | null {
  switch (timer.status) {
    case 'idle':
      return null;
    case 'running':
      return timeLeftUntil(timer.endsAt, now);
    case 'paused':
      return timer.remainingMs;
  }
}

function timeLeftUntil(endsAt: number, now: number): number {
  return Math.max(0, endsAt - now);
}

/**
 * Formats the Focus timer's time left as a clock: `m:ss`, or `h:mm:ss` from
 * an hour up. Seconds round up, so a fresh 25-minute timer reads 25:00 and
 * 0:00 only shows once it has run out.
 */
export function formatFocusTimeLeft(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  if (hours === 0) return `${minutes}:${seconds}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
}
