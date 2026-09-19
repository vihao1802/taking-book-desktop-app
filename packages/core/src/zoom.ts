/**
 * Pure zoom rules for the reader overlay, shared by both platforms. The reader
 * stores zoom as a multiplier (1 = 100%); these rules operate on whole
 * percentages so presets and snapping stay exact.
 */

/** Canonical zoom levels offered in the reader overlay dropdown. */
export const ZOOM_PRESETS: number[] = [50, 75, 100, 125, 150, 175, 200];

export const ZOOM_MIN_PERCENT = 50;
export const ZOOM_MAX_PERCENT = 200;

/** Converts a zoom multiplier (1 = 100%) to a whole percentage. */
export function multiplierToPercent(multiplier: number): number {
  return Math.round(multiplier * 100);
}

/** Converts a zoom percentage to its multiplier (percent / 100). */
export function percentToMultiplier(percent: number): number {
  return percent / 100;
}

/** Clamps a zoom percentage into the supported range. */
export function clampZoomPercent(value: number): number {
  return Math.min(ZOOM_MAX_PERCENT, Math.max(ZOOM_MIN_PERCENT, value));
}

/** Next preset strictly above `value`, or null when already at/above the max. */
export function nextPresetPercent(value: number): number | null {
  const next = ZOOM_PRESETS.find((preset) => preset > value);
  return next ?? null;
}

/** Previous preset strictly below `value`, or null when already at/below the min. */
export function previousPresetPercent(value: number): number | null {
  const prev = [...ZOOM_PRESETS].reverse().find((preset) => preset < value);
  return prev ?? null;
}

/**
 * Validates a user-entered custom zoom percentage. Accepts a whole number
 * (integer only) in the supported range; returns null for anything else.
 */
export function parseCustomZoomPercent(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (value < ZOOM_MIN_PERCENT || value > ZOOM_MAX_PERCENT) return null;
  return value;
}

/**
 * Zoom multiplier one preset step away from `multiplier`, matching what the
 * overlay's −/+ buttons do so keyboard zoom lands on the same levels.
 *
 * @param multiplier - Current zoom (1 = 100%).
 * @param direction - 'in' for the next preset above, 'out' for the one below.
 * @returns The new multiplier, or null when already at the limit.
 */
export function stepZoomMultiplier(multiplier: number, direction: 'in' | 'out'): number | null {
  const percent = multiplierToPercent(multiplier);
  const next = direction === 'in' ? nextPresetPercent(percent) : previousPresetPercent(percent);
  return next === null ? null : percentToMultiplier(next);
}
