/** Candidate Y-axis steps while the axis stays in minutes (max <= 60). */
const MINUTE_STEPS = [15, 30, 60];

/** Candidate Y-axis steps once the axis switches to hours (max > 60); all multiples of 60. */
const HOUR_STEPS = [60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 900, 1080, 1260, 1440];

/** Picks the smallest candidate step that keeps the axis to at most 5 intervals. */
function pickStep(max: number, candidates: number[]): number {
  for (const step of candidates) {
    if (Math.ceil(max / step) <= 5) return step;
  }
  return candidates[candidates.length - 1];
}

function axisLabel(value: number, useHours: boolean): string {
  return useHours ? `${value / 60}h` : `${value}m`;
}

/** One Y-axis gridline: the raw minute value and its display label. */
export interface YAxisTick {
  value: number;
  label: string;
}

/**
 * Nice-rounded Y-axis gridlines for a reading-time chart. Stays in whole
 * minutes while the max is at most an hour, then switches the whole axis to
 * whole-hour steps and labels so a single axis never mixes "45m" with "1h 15m".
 */
export function computeYAxisTicks(maxMinutes: number): YAxisTick[] {
  const useHours = maxMinutes > 60;
  const step = pickStep(maxMinutes, useHours ? HOUR_STEPS : MINUTE_STEPS);
  const top = Math.ceil(maxMinutes / step) * step || step;

  const ticks: YAxisTick[] = [];
  for (let value = 0; value <= top; value += step) {
    ticks.push({ value, label: axisLabel(value, useHours) });
  }
  return ticks;
}

/**
 * Indices into `data` that should carry an X-axis date label, at a roughly
 * weekly cadence anchored to the most recent (last) point.
 */
export function computeXAxisTicks(data: Array<{ day: string }>): number[] {
  if (data.length === 0) return [];
  const indices: number[] = [];
  for (let i = data.length - 1; i >= 0; i -= 7) indices.push(i);
  return indices.reverse();
}

/** Formats a local `YYYY-MM-DD` day string as a short "Mon D" label. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Formats a minute count as a compact "45m" / "1h" / "1h 30m" label. */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Clamps a tooltip's left edge so a box of `width` centered on `centerX`
 * stays fully within `[min, max]`.
 */
export function clampTooltipX(centerX: number, width: number, min: number, max: number): number {
  return Math.min(Math.max(centerX - width / 2, min), max - width);
}
