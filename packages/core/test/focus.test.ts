import { describe, expect, it } from 'vitest';
import { INITIAL_FOCUS_STATE, applyFocusAction, formatFocusTimeLeft, getFocusTimeLeftMs, parseFocusMinutes, type FocusAction, type FocusState, type FocusTransition } from '../src';

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
