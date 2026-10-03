import { describe, expect, it } from 'vitest';
import { clampTooltipX, computeXAxisTicks, computeYAxisTicks, formatDay, formatDuration, formatMinutes } from './chartAxes';

describe('formatMinutes', () => {
  it('formats sub-hour values in minutes', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
  });

  it('rounds fractional minutes to the nearest whole minute', () => {
    expect(formatMinutes(45.4)).toBe('45m');
    expect(formatMinutes(59.6)).toBe('1h');
  });

  it('formats whole hours without a minutes remainder', () => {
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(120)).toBe('2h');
  });

  it('formats hours with a minutes remainder', () => {
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(125)).toBe('2h 5m');
  });
});

describe('formatDuration', () => {
  it('shows whole minutes below an hour', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45.4)).toBe('45 min');
  });

  it('switches to hours with one decimal from an hour up', () => {
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(90)).toBe('1.5 h');
    expect(formatDuration(100)).toBe('1.7 h');
  });

  it('drops a trailing .0 and rounds minutes before choosing the unit', () => {
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(59.6)).toBe('1 h');
  });
});

describe('formatDay', () => {
  it('formats a local YYYY-MM-DD string as a short month + day label', () => {
    const expected = new Date(2026, 7, 15).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    expect(formatDay('2026-08-15')).toBe(expected);
  });
});

describe('computeYAxisTicks', () => {
  it('picks a 15-minute step and rounds the top up to it, for a sub-hour max', () => {
    expect(computeYAxisTicks(42)).toEqual([
      { value: 0, label: '0m' },
      { value: 15, label: '15m' },
      { value: 30, label: '30m' },
      { value: 45, label: '45m' },
    ]);
  });

  it('still returns a minimal nice axis for all-zero data', () => {
    expect(computeYAxisTicks(0)).toEqual([
      { value: 0, label: '0m' },
      { value: 15, label: '15m' },
    ]);
  });

  it('switches to hour-only steps and labels once the max clearly exceeds 60 minutes', () => {
    expect(computeYAxisTicks(75)).toEqual([
      { value: 0, label: '0h' },
      { value: 60, label: '1h' },
      { value: 120, label: '2h' },
    ]);
  });

  it('scales the hour step up for large maxima instead of producing too many ticks', () => {
    expect(computeYAxisTicks(500)).toEqual([
      { value: 0, label: '0h' },
      { value: 120, label: '2h' },
      { value: 240, label: '4h' },
      { value: 360, label: '6h' },
      { value: 480, label: '8h' },
      { value: 600, label: '10h' },
    ]);
  });

  it('never mixes minute and hour labels on the same axis', () => {
    for (const max of [0, 42, 60, 61, 75, 500]) {
      const labels = computeYAxisTicks(max).map((t) => t.label);
      const hasHour = labels.some((l) => l.includes('h'));
      const hasMinuteOnly = labels.some((l) => /^\d+m$/.test(l));
      expect(hasHour && hasMinuteOnly).toBe(false);
    }
  });
});

describe('computeXAxisTicks', () => {
  it('returns no ticks for empty data', () => {
    expect(computeXAxisTicks([])).toEqual([]);
  });

  it('returns a single tick for a single data point', () => {
    expect(computeXAxisTicks([{ day: '2026-08-15' }])).toEqual([0]);
  });

  it('labels roughly weekly, anchored to the most recent point, over a 30-day window', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ day: `day-${i}` }));
    expect(computeXAxisTicks(data)).toEqual([1, 8, 15, 22, 29]);
  });

  it('always includes the last index and steps backward by 7', () => {
    const data = Array.from({ length: 8 }, (_, i) => ({ day: `day-${i}` }));
    expect(computeXAxisTicks(data)).toEqual([0, 7]);
  });
});

describe('clampTooltipX', () => {
  it('centers the box on centerX when there is room on both sides', () => {
    expect(clampTooltipX(300, 92, 34, 630)).toBe(254);
  });

  it('clamps to the left edge when centering would overflow it', () => {
    expect(clampTooltipX(40, 92, 34, 630)).toBe(34);
  });

  it('clamps to the right edge when centering would overflow it', () => {
    expect(clampTooltipX(620, 92, 34, 630)).toBe(538);
  });
});
