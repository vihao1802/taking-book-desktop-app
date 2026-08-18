import { describe, expect, it } from 'vitest';
import {
  computeCurrentStreak,
  computeLongestStreak,
  computeReadingStats,
  dayOffset,
  getDailyReadingMinutes,
  readingSessionsSchema,
  recordReadingSession,
  upsertFile,
  filesSchema,
  isOk,
} from '../src';
import { createMemoryDriver } from './helpers';

describe('readingSessionsRepository', () => {
  it('accumulates minutes per file per day', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${readingSessionsSchema()}`);
    const created = await upsertFile(db, { filePath: '/b.pdf', hash: 'h', title: 'B' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    await recordReadingSession(db, created.data.id, '2026-08-14', 10);
    await recordReadingSession(db, created.data.id, '2026-08-14', 5);

    const daily = await getDailyReadingMinutes(db, 30, '2026-08-15');
    expect(isOk(daily)).toBe(true);
    if (isOk(daily)) {
      const entry = daily.data.find((d) => d.day === '2026-08-14');
      expect(entry?.minutes).toBe(15);
    }
  });

  it('ignores non-positive minutes', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${readingSessionsSchema()}`);
    const created = await upsertFile(db, { filePath: '/b.pdf', hash: 'h', title: 'B' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    await recordReadingSession(db, created.data.id, '2026-08-14', 0);
    const daily = await getDailyReadingMinutes(db, 30, '2026-08-15');
    expect(isOk(daily)).toBe(true);
    if (isOk(daily)) expect(daily.data).toHaveLength(0);
  });

  it('only returns rows within the trailing window', async () => {
    const db = createMemoryDriver();
    await db.exec(`${filesSchema()} ${readingSessionsSchema()}`);
    const created = await upsertFile(db, { filePath: '/b.pdf', hash: 'h', title: 'B' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    await recordReadingSession(db, created.data.id, '2026-07-01', 20);
    await recordReadingSession(db, created.data.id, '2026-08-14', 10);

    const daily = await getDailyReadingMinutes(db, 7, '2026-08-15');
    expect(isOk(daily)).toBe(true);
    if (isOk(daily)) {
      expect(daily.data).toHaveLength(1);
      expect(daily.data[0].day).toBe('2026-08-14');
    }
  });
});

describe('dayOffset', () => {
  it('moves days forward and backward across month boundaries', () => {
    expect(dayOffset('2026-08-01', -1)).toBe('2026-07-31');
    expect(dayOffset('2026-08-15', 1)).toBe('2026-08-16');
    expect(dayOffset('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('streak computation', () => {
  const byDay = (days: string[]): Map<string, number> =>
    new Map(days.map((d) => [d, 10]));

  it('counts consecutive days ending today', () => {
    const map = byDay(['2026-08-13', '2026-08-14', '2026-08-15']);
    expect(computeCurrentStreak(map, '2026-08-15')).toBe(3);
  });

  it('counts back from yesterday when today is empty', () => {
    const map = byDay(['2026-08-13', '2026-08-14']);
    expect(computeCurrentStreak(map, '2026-08-15')).toBe(2);
  });

  it('returns zero when nothing was read', () => {
    expect(computeCurrentStreak(new Map(), '2026-08-15')).toBe(0);
  });

  it('breaks the streak on a missed day', () => {
    const map = byDay(['2026-08-12', '2026-08-13', '2026-08-15']);
    expect(computeCurrentStreak(map, '2026-08-15')).toBe(1);
  });

  it('computes the longest run in a series', () => {
    const series = [
      { day: '2026-08-11', minutes: 5 },
      { day: '2026-08-12', minutes: 5 },
      { day: '2026-08-13', minutes: 5 },
      { day: '2026-08-14', minutes: 0 },
      { day: '2026-08-15', minutes: 5 },
    ];
    expect(computeLongestStreak(series)).toBe(3);
  });

  it('builds a complete daily series with zeros for gaps', () => {
    const stats = computeReadingStats(
      [{ day: '2026-08-14', minutes: 30 }],
      5,
      '2026-08-15',
    );
    expect(stats.series).toEqual([
      { day: '2026-08-11', minutes: 0 },
      { day: '2026-08-12', minutes: 0 },
      { day: '2026-08-13', minutes: 0 },
      { day: '2026-08-14', minutes: 30 },
      { day: '2026-08-15', minutes: 0 },
    ]);
    expect(stats.totalMinutes).toBe(30);
    expect(stats.minutesToday).toBe(0);
    expect(stats.currentStreak).toBe(1);
  });
});