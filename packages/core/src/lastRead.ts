const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/**
 * Describes when a Book was last read, relative to `now` ("Last read 2 hours
 * ago"), falling back to the date once it is a week or more ago. A read time
 * after `now` (another device's clock running ahead) reads as "just now".
 *
 * @param lastReadAt epoch ms of the last read
 * @param now epoch ms to measure from, passed in so the result is deterministic
 * @returns the full "Last read …" phrase
 */
export function formatLastRead(lastReadAt: number, now: number): string {
  const elapsed = Math.max(0, now - lastReadAt);
  if (elapsed < MINUTE_MS) return 'Last read just now';
  if (elapsed < HOUR_MS) return `Last read ${countOf(elapsed / MINUTE_MS, 'minute')} ago`;
  if (elapsed < DAY_MS) return `Last read ${countOf(elapsed / HOUR_MS, 'hour')} ago`;
  if (elapsed < 2 * DAY_MS) return 'Last read yesterday';
  if (elapsed < WEEK_MS) return `Last read ${countOf(elapsed / DAY_MS, 'day')} ago`;
  return `Last read on ${DATE_FORMAT.format(lastReadAt)}`;
}

function countOf(amount: number, unit: string): string {
  const whole = Math.floor(amount);
  return `${whole} ${unit}${whole === 1 ? '' : 's'}`;
}
