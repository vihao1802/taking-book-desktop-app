import { describe, expect, it } from 'vitest';
import { AMBIENT_SOUNDS, DEFAULT_AMBIENT_VOLUME, INITIAL_FOCUS_STATE, applyFocusAction, getAmbientSound, formatFocusTimeLeft, getFocusTimeLeftMs, isFocusActive, parseFocusMinutes, type FocusAction, type FocusState, type FocusTransition } from '../src';

const MINUTE = 60_000;

/** Applies an action that must succeed, failing the test otherwise. */
function apply(state: FocusState, action: FocusAction, now: number): FocusTransition {
  const result = applyFocusAction(state, action, now);
  if (!result.ok) throw new Error(`unexpected ${result.error}`);
  return result.data;
}

describe('parseFocusMinutes', () => {
  it.each([
    ['15', 15],
    ['25', 25],
    ['45', 45],
    ['60', 60],
    ['1', 1],
    ['180', 180],
    [' 90 ', 90],
  ])('accepts "%s" as %i minutes', (input, expected) => {
    expect(parseFocusMinutes(input)).toEqual({ ok: true, data: expected });
  });

  it.each(['0', '181', '-5', '2.5', '', 'abc', '1e2'])('rejects "%s" as an invalid length', (input) => {
    expect(parseFocusMinutes(input)).toEqual({ ok: false, error: 'invalid-length' });
  });
});

describe('applyFocusAction', () => {
  it('runs a started Focus timer out on the first tick at its end, with a chime and a notice', () => {
    const started = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 25 }, 1_000);
    expect(started.effects).toEqual([]);

    const early = apply(started.state, { type: 'tick' }, 1_000 + 25 * MINUTE - 1);
    expect(early).toEqual({ state: started.state, effects: [] });

    const ended = apply(early.state, { type: 'tick' }, 1_000 + 25 * MINUTE);
    expect(ended.state).toEqual(INITIAL_FOCUS_STATE);
    expect(ended.effects).toEqual([{ type: 'chime' }, { type: 'notify' }]);
  });

  it.each([0, 181, 2.5, Number.NaN])('rejects starting a Focus timer of %d minutes', (minutes) => {
    expect(applyFocusAction(INITIAL_FOCUS_STATE, { type: 'start', minutes }, 0)).toEqual({ ok: false, error: 'invalid-length' });
  });

  it('stops a running Focus timer by hand with neither a chime nor a notice', () => {
    const started = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 15 }, 0);

    const stopped = apply(started.state, { type: 'stop' }, 5 * MINUTE);
    expect(stopped).toEqual({ state: INITIAL_FOCUS_STATE, effects: [] });

    const later = apply(stopped.state, { type: 'tick' }, 60 * MINUTE);
    expect(later.effects).toEqual([]);
  });

  it('pauses and resumes a Focus timer from exactly the time it had left', () => {
    const started = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 25 }, 0);
    const paused = apply(started.state, { type: 'pause' }, 10 * MINUTE + 500);
    expect(paused.effects).toEqual([]);
    expect(getFocusTimeLeftMs(paused.state.timer, 10 * MINUTE + 500)).toBe(15 * MINUTE - 500);

    const resumed = apply(paused.state, { type: 'resume' }, 200 * MINUTE);
    expect(resumed.effects).toEqual([]);
    expect(getFocusTimeLeftMs(resumed.state.timer, 200 * MINUTE)).toBe(15 * MINUTE - 500);

    const ended = apply(resumed.state, { type: 'tick' }, 215 * MINUTE - 500);
    expect(ended.effects).toEqual([{ type: 'chime' }, { type: 'notify' }]);
  });

  it('leaves a paused Focus timer untouched by ticks, however late', () => {
    const started = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 15 }, 0);
    const paused = apply(started.state, { type: 'pause' }, 5 * MINUTE);

    const ticked = apply(paused.state, { type: 'tick' }, 500 * MINUTE);
    expect(ticked).toEqual({ state: paused.state, effects: [] });
    expect(getFocusTimeLeftMs(ticked.state.timer, 500 * MINUTE)).toBe(10 * MINUTE);
  });

  it('ignores pause and resume when there is nothing to pause or resume', () => {
    expect(apply(INITIAL_FOCUS_STATE, { type: 'pause' }, 0)).toEqual({ state: INITIAL_FOCUS_STATE, effects: [] });
    expect(apply(INITIAL_FOCUS_STATE, { type: 'resume' }, 0)).toEqual({ state: INITIAL_FOCUS_STATE, effects: [] });

    const started = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 15 }, 0);
    expect(apply(started.state, { type: 'resume' }, MINUTE)).toEqual({ state: started.state, effects: [] });
  });
});

describe('getFocusTimeLeftMs', () => {
  it('counts down against the end time and never goes below zero', () => {
    const { state } = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 1 }, 0);
    expect(getFocusTimeLeftMs(state.timer, 0)).toBe(MINUTE);
    expect(getFocusTimeLeftMs(state.timer, 45_000)).toBe(15_000);
    expect(getFocusTimeLeftMs(state.timer, 2 * MINUTE)).toBe(0);
  });

  it('has no time left to show when no Focus timer is running', () => {
    expect(getFocusTimeLeftMs(INITIAL_FOCUS_STATE.timer, 0)).toBeNull();
  });
});

describe('formatFocusTimeLeft', () => {
  it.each([
    [25 * MINUTE, '25:00'],
    [15 * MINUTE - 500, '15:00'],
    [9 * MINUTE + 5_000, '9:05'],
    [59_000, '0:59'],
    [1, '0:01'],
    [0, '0:00'],
    [60 * MINUTE, '1:00:00'],
    [61 * MINUTE + 5_000, '1:01:05'],
    [180 * MINUTE, '3:00:00'],
  ])('shows %i ms left as "%s"', (ms, expected) => {
    expect(formatFocusTimeLeft(ms)).toBe(expected);
  });
});

describe('Ambient sound', () => {
  it('lists the noise colors, nature recordings and instrumental styles in the sound catalog', () => {
    expect(AMBIENT_SOUNDS.map(({ id, kind, name }) => ({ id, kind, name }))).toEqual([
      { id: 'white-noise', kind: 'noise', name: 'White noise' },
      { id: 'pink-noise', kind: 'noise', name: 'Pink noise' },
      { id: 'brown-noise', kind: 'noise', name: 'Brown noise' },
      { id: 'rain', kind: 'nature', name: 'Rain' },
      { id: 'fire', kind: 'nature', name: 'Fire' },
      { id: 'forest', kind: 'nature', name: 'Forest' },
      { id: 'ocean', kind: 'nature', name: 'Ocean' },
      { id: 'lofi', kind: 'instrumental', name: 'Lo-fi' },
      { id: 'piano', kind: 'instrumental', name: 'Piano' },
      { id: 'calm-ambient', kind: 'instrumental', name: 'Calm ambient' },
    ]);
    expect(getAmbientSound('pink-noise')?.name).toBe('Pink noise');
    expect(getAmbientSound('cafe')).toBeNull();
  });

  it('gives each instrumental style 2 to 3 ordered tracks and no other sound any', () => {
    for (const sound of AMBIENT_SOUNDS) {
      if (sound.kind === 'instrumental') {
        expect(sound.trackIds?.length).toBeGreaterThanOrEqual(2);
        expect(sound.trackIds?.length).toBeLessThanOrEqual(3);
      } else {
        expect(sound.trackIds).toBeUndefined();
      }
    }
    expect(getAmbientSound('lofi')?.trackIds).toEqual(['lofi-calm-currents', 'lofi-color-of-a-soul', 'lofi-break-from-reality']);
  });

  it('plays a chosen sound at the current volume when none is playing, with no Focus timer', () => {
    const chosen = apply(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'white-noise' }, 0);

    expect(chosen.effects).toEqual([{ type: 'play-sound', soundId: 'white-noise', volume: DEFAULT_AMBIENT_VOLUME }]);
    expect(chosen.state.sound).toEqual({ soundId: 'white-noise', volume: DEFAULT_AMBIENT_VOLUME, status: 'playing' });
    expect(chosen.state.timer).toEqual({ status: 'idle' });
  });

  it('replaces a playing sound with a newly chosen one, keeping the volume', () => {
    const playing = apply(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'white-noise' }, 0);
    const quieter = apply(playing.state, { type: 'set-volume', volume: 0.2 }, 0);

    const replaced = apply(quieter.state, { type: 'choose-sound', soundId: 'brown-noise' }, 0);
    expect(replaced.effects).toEqual([{ type: 'play-sound', soundId: 'brown-noise', volume: 0.2 }]);
    expect(replaced.state.sound).toEqual({ soundId: 'brown-noise', volume: 0.2, status: 'playing' });
  });

  it('keeps playing without restarting when the playing sound is chosen again', () => {
    const playing = apply(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'pink-noise' }, 0);
    expect(apply(playing.state, { type: 'choose-sound', soundId: 'pink-noise' }, 0)).toEqual({ state: playing.state, effects: [] });
  });

  it('rejects choosing a sound that is not in the catalog', () => {
    expect(applyFocusAction(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'cafe' }, 0)).toEqual({ ok: false, error: 'unknown-sound' });
  });

  it('stops a playing sound, remembering it and the volume for the next play', () => {
    const playing = apply(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'pink-noise' }, 0);

    const stopped = apply(playing.state, { type: 'stop-sound' }, 0);
    expect(stopped.effects).toEqual([{ type: 'stop-sound' }]);
    expect(stopped.state.sound).toEqual({ soundId: 'pink-noise', volume: DEFAULT_AMBIENT_VOLUME, status: 'stopped' });

    expect(apply(stopped.state, { type: 'stop-sound' }, 0).effects).toEqual([]);
    expect(apply(stopped.state, { type: 'choose-sound', soundId: 'pink-noise' }, 0).effects).toEqual([
      { type: 'play-sound', soundId: 'pink-noise', volume: DEFAULT_AMBIENT_VOLUME },
    ]);
  });

  it('changes the volume of a playing sound live, and only stores it while silent', () => {
    const playing = apply(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'white-noise' }, 0);
    const louder = apply(playing.state, { type: 'set-volume', volume: 0.9 }, 0);
    expect(louder.effects).toEqual([{ type: 'set-volume', volume: 0.9 }]);
    expect(louder.state.sound.volume).toBe(0.9);

    const silent = apply(INITIAL_FOCUS_STATE, { type: 'set-volume', volume: 0.3 }, 0);
    expect(silent.effects).toEqual([]);
    expect(silent.state.sound.volume).toBe(0.3);
  });

  it('keeps the volume from 0 to 1 and rejects a volume that is not a number', () => {
    expect(apply(INITIAL_FOCUS_STATE, { type: 'set-volume', volume: 1.5 }, 0).state.sound.volume).toBe(1);
    expect(apply(INITIAL_FOCUS_STATE, { type: 'set-volume', volume: -0.2 }, 0).state.sound.volume).toBe(0);
    expect(applyFocusAction(INITIAL_FOCUS_STATE, { type: 'set-volume', volume: Number.NaN }, 0)).toEqual({ ok: false, error: 'invalid-volume' });
  });

  it('keeps a playing sound playing when a Focus timer starts', () => {
    const playing = apply(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'brown-noise' }, 0);
    const started = apply(playing.state, { type: 'start', minutes: 1 }, 0);
    expect(started.effects).toEqual([]);
    expect(started.state.sound).toEqual(playing.state.sound);
  });
});

describe('Focus timer and Ambient sound together', () => {
  const withSound = (now: number): FocusState => {
    const started = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 25 }, now);
    return apply(started.state, { type: 'choose-sound', soundId: 'white-noise' }, now).state;
  };

  it('pauses a playing sound with the timer and resumes it with the timer', () => {
    const paused = apply(withSound(0), { type: 'pause' }, MINUTE);
    expect(paused.effects).toEqual([{ type: 'pause-sound' }]);
    expect(paused.state.sound.status).toBe('paused');

    const resumed = apply(paused.state, { type: 'resume' }, 2 * MINUTE);
    expect(resumed.effects).toEqual([{ type: 'resume-sound' }]);
    expect(resumed.state.sound.status).toBe('playing');
  });

  it('does not restart a sound the reader stopped while the timer was paused', () => {
    const paused = apply(withSound(0), { type: 'pause' }, MINUTE);
    const stopped = apply(paused.state, { type: 'stop-sound' }, MINUTE);
    expect(stopped.effects).toEqual([{ type: 'stop-sound' }]);

    const resumed = apply(stopped.state, { type: 'resume' }, 2 * MINUTE);
    expect(resumed.effects).toEqual([]);
    expect(resumed.state.sound.status).toBe('stopped');
  });

  it('fades a playing sound when the timer runs out, after the chime and notice', () => {
    const ended = apply(withSound(0), { type: 'tick' }, 25 * MINUTE);
    expect(ended.effects).toEqual([{ type: 'chime' }, { type: 'notify' }, { type: 'fade-out-sound' }]);
    expect(ended.state.sound.status).toBe('stopped');
  });

  it('fades a playing sound on a manual stop, without a chime or notice', () => {
    const stopped = apply(withSound(0), { type: 'stop' }, MINUTE);
    expect(stopped.effects).toEqual([{ type: 'fade-out-sound' }]);
    expect(stopped.state.timer).toEqual({ status: 'idle' });
  });

  it('silences a paused sound at once when the timer is stopped by hand', () => {
    const paused = apply(withSound(0), { type: 'pause' }, MINUTE);
    const stopped = apply(paused.state, { type: 'stop' }, MINUTE);
    expect(stopped.effects).toEqual([{ type: 'stop-sound' }]);
    expect(stopped.state.sound.status).toBe('stopped');
  });

  it('emits no sound effect when no sound plays', () => {
    const started = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 25 }, 0);
    const paused = apply(started.state, { type: 'pause' }, MINUTE);
    expect(paused.effects).toEqual([]);
    expect(apply(paused.state, { type: 'resume' }, 2 * MINUTE).effects).toEqual([]);
    expect(apply(started.state, { type: 'stop' }, MINUTE).effects).toEqual([]);
    expect(apply(started.state, { type: 'tick' }, 25 * MINUTE).effects).toEqual([{ type: 'chime' }, { type: 'notify' }]);
  });

  it('leaves a sound playing when the timer is idle and stop is pressed', () => {
    const playing = apply(INITIAL_FOCUS_STATE, { type: 'choose-sound', soundId: 'pink-noise' }, 0);
    expect(apply(playing.state, { type: 'stop' }, 0)).toEqual({ state: playing.state, effects: [] });
  });
});

describe('isFocusActive', () => {
  const start = apply(INITIAL_FOCUS_STATE, { type: 'start', minutes: 25 }, 0).state;
  const withSound = (status: 'playing' | 'paused' | 'stopped'): FocusState => ({
    ...INITIAL_FOCUS_STATE,
    sound: { soundId: 'white-noise', volume: DEFAULT_AMBIENT_VOLUME, status },
  });

  it('is false when the timer is idle and no sound plays', () => {
    expect(isFocusActive(INITIAL_FOCUS_STATE)).toBe(false);
    expect(isFocusActive(withSound('stopped'))).toBe(false);
  });

  it('is true for a running or paused timer alone', () => {
    expect(isFocusActive(start)).toBe(true);
    expect(isFocusActive(apply(start, { type: 'pause' }, 1_000).state)).toBe(true);
  });

  it('is true for a playing or paused sound alone', () => {
    expect(isFocusActive(withSound('playing'))).toBe(true);
    expect(isFocusActive(withSound('paused'))).toBe(true);
  });

  it('is true for a timer and a sound together', () => {
    expect(isFocusActive({ ...start, sound: withSound('playing').sound })).toBe(true);
  });
});
