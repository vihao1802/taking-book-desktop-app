import { describe, expect, it } from 'vitest';
import { formatLastRead } from '../src';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Noon, so the date fallback names the same day in any timezone within ±11h.
const NOW = new Date('2026-03-20T12:00:00Z').getTime();

describe('formatLastRead', () => {
  it('says "just now" within the first minute', () => {
    expect(formatLastRead(NOW - 30_000, NOW)).toBe('Last read just now');
  });

  it('says "just now" for a timestamp slightly in the future (clock skew from sync)', () => {
    expect(formatLastRead(NOW + 5 * MINUTE, NOW)).toBe('Last read just now');
  });

  it('counts minutes under an hour, singular for one', () => {
    expect(formatLastRead(NOW - MINUTE, NOW)).toBe('Last read 1 minute ago');
    expect(formatLastRead(NOW - 59 * MINUTE, NOW)).toBe('Last read 59 minutes ago');
  });

  it('counts hours under a day, singular for one', () => {
    expect(formatLastRead(NOW - HOUR, NOW)).toBe('Last read 1 hour ago');
    expect(formatLastRead(NOW - 2 * HOUR - 10 * MINUTE, NOW)).toBe('Last read 2 hours ago');
    expect(formatLastRead(NOW - 23 * HOUR, NOW)).toBe('Last read 23 hours ago');
  });

  it('says "yesterday" between one and two days ago', () => {
    expect(formatLastRead(NOW - DAY, NOW)).toBe('Last read yesterday');
    expect(formatLastRead(NOW - 47 * HOUR, NOW)).toBe('Last read yesterday');
  });

  it('counts days under a week', () => {
    expect(formatLastRead(NOW - 2 * DAY, NOW)).toBe('Last read 2 days ago');
    expect(formatLastRead(NOW - 6 * DAY - 23 * HOUR, NOW)).toBe('Last read 6 days ago');
  });

  it('falls back to the date from a week on', () => {
    expect(formatLastRead(NOW - 7 * DAY, NOW)).toBe('Last read on Mar 13, 2026');
    expect(formatLastRead(new Date('2025-11-02T12:00:00Z').getTime(), NOW)).toBe(
      'Last read on Nov 2, 2025',
    );
  });
});
