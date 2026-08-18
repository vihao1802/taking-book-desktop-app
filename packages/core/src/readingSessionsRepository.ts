import type { ReadingStats } from './models';
import type { Result } from './result';
import { err, ok } from './result';
import type { SqlDriver } from './sql';

/**
 * DB access for reading sessions: one row per (file, local calendar day)
 * holding the reading minutes accumulated that day. Local-only data — reading
 * habits are intentionally not part of the sync manifest.
 */

/** Returns the schema DDL for the reading sessions table. */
export function readingSessionsSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS reading_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      minutes REAL NOT NULL,
      UNIQUE (file_id, day)
    );
  `;
}

/**
 * Adds `minutes` to a file's reading total for the given local day
 * (YYYY-MM-DD), creating the row when it does not exist yet. Idempotent and
 * merge-friendly because it accumulates rather than overwrites.
 */
export async function recordReadingSession(
  db: SqlDriver,
  fileId: number,
  day: string,
  minutes: number,
): Promise<Result<void>> {
  if (minutes <= 0) return ok(undefined);
  try {
    await db.run(
      `INSERT INTO reading_sessions (file_id, day, minutes) VALUES (?, ?, ?)
       ON CONFLICT (file_id, day) DO UPDATE SET minutes = minutes + excluded.minutes`,
      [fileId, day, minutes],
    );
    return ok(undefined);
  } catch (error) {
    return err(`Failed to record reading session for file ${fileId}: ${errorMessage(error)}`);
  }
}

/**
 * Returns the reading minutes per day for the last `days` days (inclusive of
 * today), oldest first. Days with no reading are not included; the caller fills
 * gaps for the chart.
 */
export async function getDailyReadingMinutes(
  db: SqlDriver,
  days: number,
  today: string,
): Promise<Result<Array<{ day: string; minutes: number }>>> {
  try {
    const cutoff = dayOffset(today, -(days - 1));
    const rows = await db.all(
      'SELECT day, SUM(minutes) AS minutes FROM reading_sessions WHERE day >= ? GROUP BY day ORDER BY day ASC',
      [cutoff],
    );
    return ok(
      rows.map((row) => ({ day: String(row.day), minutes: Number(row.minutes ?? 0) })),
    );
  } catch (error) {
    return err(`Failed to read reading stats: ${errorMessage(error)}`);
  }
}

/** Returns a YYYY-MM-DD string `delta` days before (negative) or after `day`. */
export function dayOffset(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Builds a `ReadingStats` for the trailing window from per-day minutes. */
export function computeReadingStats(
  daily: Array<{ day: string; minutes: number }>,
  days: number,
  today: string,
): ReadingStats {
  const byDay = new Map(daily.map((d) => [d.day, d.minutes]));
  const series: Array<{ day: string; minutes: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOffset(today, -i);
    series.push({ day, minutes: byDay.get(day) ?? 0 });
  }
  return {
    series,
    currentStreak: computeCurrentStreak(byDay, today),
    longestStreak: computeLongestStreak(series),
    totalMinutes: series.reduce((sum, d) => sum + d.minutes, 0),
    minutesToday: byDay.get(today) ?? 0,
  };
}

/** Consecutive days with reading ending today; if today is empty, counts back from yesterday. */
export function computeCurrentStreak(
  byDay: Map<string, number>,
  today: string,
): number {
  let cursor = today;
  if ((byDay.get(cursor) ?? 0) <= 0) cursor = dayOffset(today, -1);
  let streak = 0;
  while ((byDay.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = dayOffset(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive reading days within the series. */
export function computeLongestStreak(series: Array<{ day: string; minutes: number }>): number {
  let longest = 0;
  let run = 0;
  for (const entry of series) {
    run = entry.minutes > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return longest;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
