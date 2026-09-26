/** The band of the day the Greeting is chosen by. */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * Puts a local clock hour into its band of the day: morning from 5, afternoon
 * from 12, evening from 18, night from 22 until 5. Night exists so the small
 * hours never read "Good morning" next to a visible clock showing 2:00 AM.
 *
 * @param hour local hour, 0–23
 * @returns the band the hour falls in
 */
export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

const GREETINGS: Record<TimeOfDay, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Good night',
};

/**
 * Words the Greeting for a band of the day, so every platform greets alike.
 *
 * @param timeOfDay the band of the day
 * @returns the Greeting wording for that band
 */
export function getGreeting(timeOfDay: TimeOfDay): string {
  return GREETINGS[timeOfDay];
}

const MINUTE_MS = 60_000;

/**
 * The date and time shown after the Greeting, e.g. "Sat, Sep 26 · 2:34 PM".
 * Wording, order and 12/24-hour clock follow the locale; the date is in the
 * local time zone. A missing or malformed locale (an OS can report one Intl
 * rejects) falls back to the runtime default instead of throwing.
 *
 * @param date the moment to show
 * @param locale the OS regional-format locale, e.g. `en-GB`, or null when unknown
 * @returns the date and time, joined by " · "
 */
export function formatGreetingDateTime(date: Date, locale: string | null): string {
  const usable = toUsableLocale(locale);
  const day = date.toLocaleDateString(usable, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(usable, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

function toUsableLocale(locale: string | null): string | undefined {
  if (locale === null) return undefined;
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale)[0];
  } catch {
    // A malformed tag is expected input here, not a fault: the default locale is the answer.
    return undefined;
  }
}

/**
 * The machine-readable form of the minute the Greeting shows, e.g.
 * `2026-09-26T14:34+07:00`: local wall-clock time with its UTC offset, so it
 * names the same day and minute as the visible text even near midnight.
 *
 * @param date the moment shown
 * @returns an HTML `datetime` value at minute precision
 */
export function formatLocalMinute(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const wallClock = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${wallClock}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * How long until the clock next rolls over to a new minute, so a ticker can
 * fire on the minute instead of drifting up to a minute behind the OS clock.
 *
 * @param now the current moment
 * @returns milliseconds until the next whole minute, 1–60000
 */
export function msUntilNextMinute(now: Date): number {
  return MINUTE_MS - (now.getTime() % MINUTE_MS);
}
