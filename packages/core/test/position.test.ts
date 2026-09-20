import { describe, expect, it } from 'vitest';
import { normalizePosition, progressFraction } from '../src';

describe('normalizePosition', () => {
  it('returns null for a missing position', () => {
    expect(normalizePosition(null, 10)).toBeNull();
  });

  it('clamps page into the valid range', () => {
    expect(normalizePosition({ page: 0, position: 0 }, 10)).toEqual({ page: 1, position: 0 });
    expect(normalizePosition({ page: 99, position: 0.5 }, 10)).toEqual({
      page: 10,
      position: 0.5,
    });
  });

  it('clamps negative position to zero', () => {
    expect(normalizePosition({ page: 3, position: -1 }, 10)).toEqual({ page: 3, position: 0 });
  });

  it('keeps a valid position unchanged', () => {
    expect(normalizePosition({ page: 5, position: 0.25 }, 10)).toEqual({
      page: 5,
      position: 0.25,
    });
  });
});

describe('progressFraction', () => {
  it('returns null when never read or no pages', () => {
    expect(progressFraction(null, 10)).toBeNull();
    expect(progressFraction({ page: 3, position: 0 }, 0)).toBeNull();
  });

  it('computes a fraction in [0, 1]', () => {
    expect(progressFraction({ page: 5, position: 0.5 }, 10)).toBe(0.45);
    expect(progressFraction({ page: 1, position: 0 }, 10)).toBe(0);
    expect(progressFraction({ page: 10, position: 0 }, 10)).toBe(0.9);
  });

  it('measures a reflow position by its real page and the fraction within it', () => {
    expect(progressFraction({ page: 70, position: 0.5, mode: 'reflow' }, 100)).toBe(0.695);
  });

  it('clamps to 1 for positions past the end', () => {
    expect(progressFraction({ page: 99, position: 0 }, 10)).toBe(1);
  });
});
