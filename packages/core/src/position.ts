import type { LastPosition } from './models';

/**
 * Pure rules for last-read-position, kept separate from storage so they can be
 * unit-tested and shared by both platforms.
 */

/** Clamps a stored position to the valid range for a document of `pageCount` pages. */
export function normalizePosition(
  pos: LastPosition | null,
  pageCount: number,
): LastPosition | null {
  if (!pos) return null;
  const page = Math.min(Math.max(1, Math.round(pos.page)), Math.max(1, pageCount));
  const position = pos.position < 0 ? 0 : pos.position;
  return { page, position, mode: pos.mode };
}

/** Progress as a fraction (0..1) across the whole document, or null if never read. */
export function progressFraction(pos: LastPosition | null, pageCount: number): number | null {
  if (!pos || pageCount <= 0) return null;
  const pageFraction = (pos.page - 1 + pos.position) / pageCount;
  return Math.min(1, Math.max(0, pageFraction));
}
