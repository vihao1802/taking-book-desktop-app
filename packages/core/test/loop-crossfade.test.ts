import { describe, expect, it } from 'vitest';
import { crossfadeLoop } from '../src';

describe('crossfadeLoop', () => {
  it('shortens the audio by the fade length', () => {
    expect(crossfadeLoop(new Float32Array(100), 10)).toHaveLength(90);
  });

  it('starts on the audio that follows the last sample kept, so the loop has no jump', () => {
    const ramp = Float32Array.from({ length: 100 }, (_, index) => index);
    const looped = crossfadeLoop(ramp, 10);
    // The first output sample is the tail's first sample (90), which continues the ramp after 89.
    expect(looped[0]).toBeCloseTo(90);
    expect(looped[89]).toBe(89);
  });

  it('leaves the audio after the fade untouched', () => {
    const ramp = Float32Array.from({ length: 100 }, (_, index) => index);
    const looped = crossfadeLoop(ramp, 10);
    expect(Array.from(looped.slice(10))).toEqual(Array.from(ramp.slice(10, 90)));
  });

  it('keeps steady loudness through the fade for uncorrelated sound, using equal-power gains', () => {
    const constant = new Float32Array(100).fill(1);
    const looped = crossfadeLoop(constant, 10);
    // sin + cos of the same constant is at most sqrt(2), and never dips below 1 for a constant signal.
    looped.slice(0, 10).forEach((sample) => {
      expect(sample).toBeGreaterThanOrEqual(1 - 1e-6);
      expect(sample).toBeLessThanOrEqual(Math.SQRT2 + 1e-6);
    });
  });

  it('returns a plain copy when there is no fade to apply', () => {
    const input = Float32Array.from([1, 2, 3]);
    const output = crossfadeLoop(input, 0);
    expect(Array.from(output)).toEqual([1, 2, 3]);
    expect(output).not.toBe(input);
  });

  it('limits the fade to half the audio, so a very short file still loops', () => {
    expect(crossfadeLoop(new Float32Array(10), 100)).toHaveLength(5);
  });
});
