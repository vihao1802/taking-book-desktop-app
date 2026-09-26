import { describe, expect, it } from 'vitest';
import { formatGreetingDateTime, formatLocalMinute, getGreeting, getTimeOfDay, msUntilNextMinute } from '../src';

describe('getTimeOfDay', () => {
  it.each([
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [21, 'evening'],
    [22, 'night'],
    [23, 'night'],
    [0, 'night'],
    [4, 'night'],
  ] as const)('puts hour %i in the %s', (hour, expected) => {
    expect(getTimeOfDay(hour)).toBe(expected);
  });
});

describe('getGreeting', () => {
  it.each([
    ['morning', 'Good morning'],
    ['afternoon', 'Good afternoon'],
    ['evening', 'Good evening'],
    ['night', 'Good night'],
  ] as const)('greets the %s with "%s"', (timeOfDay, expected) => {
    expect(getGreeting(timeOfDay)).toBe(expected);
  });
});

describe('formatGreetingDateTime', () => {
  const saturdayAfternoon = new Date(2026, 8, 26, 14, 34, 50);

  it('shows the weekday, date and 12-hour time for a 12-hour locale', () => {
    expect(formatGreetingDateTime(saturdayAfternoon, 'en-US')).toBe('Sat, Sep 26 · 2:34 PM');
  });

  it('shows a 24-hour time for a 24-hour locale', () => {
    expect(formatGreetingDateTime(saturdayAfternoon, 'en-GB')).toMatch(/· 14:34$/);
  });

  it('pads minutes so the clock never reads 2:5', () => {
    expect(formatGreetingDateTime(new Date(2026, 8, 26, 14, 5), 'en-US')).toMatch(/2:05 PM$/);
  });

  it('falls back to the default locale when there is none or it is malformed', () => {
    const expected = formatGreetingDateTime(saturdayAfternoon, Intl.DateTimeFormat().resolvedOptions().locale);
    expect(formatGreetingDateTime(saturdayAfternoon, null)).toBe(expected);
    expect(formatGreetingDateTime(saturdayAfternoon, 'not a locale!')).toBe(expected);
  });
});

describe('formatLocalMinute', () => {
  it('gives the local wall-clock minute with its UTC offset', () => {
    const date = new Date(2026, 8, 26, 9, 5, 42);
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    expect(formatLocalMinute(date)).toBe(`2026-09-26T09:05${sign}${hh}:${mm}`);
  });
});

describe('msUntilNextMinute', () => {
  it('waits for the rest of the current minute', () => {
    expect(msUntilNextMinute(new Date(2026, 8, 26, 14, 34, 50, 250))).toBe(9_750);
  });

  it('waits a full minute when exactly on the minute', () => {
    expect(msUntilNextMinute(new Date(2026, 8, 26, 14, 34, 0, 0))).toBe(60_000);
  });
});
