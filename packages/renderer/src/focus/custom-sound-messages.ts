import type { AddCustomSoundsSummary, RejectedCustomSound } from '@taking-book/core';

/** How the reader is told what adding Custom sounds did. */
export interface CustomSoundsNotice {
  kind: 'info' | 'error';
  text: string;
}

/** Reason shown for a file that passed the size rules but could not be decoded as audio. */
export const UNPLAYABLE_REASON = 'It is not audio this app can play.';

/**
 * Words the outcome of adding Custom sounds for the reader.
 *
 * @param summary - What the main process added, skipped as duplicates and rejected.
 * @param unplayable - File names that were added but then found not to be decodable audio, and removed again.
 * @returns A notice, or null when there is nothing to report (the picker was cancelled).
 */
export function describeAddedCustomSounds(summary: AddCustomSoundsSummary | null, unplayable: string[]): CustomSoundsNotice | null {
  if (summary === null) return null;
  const rejected: RejectedCustomSound[] = [...summary.rejected, ...unplayable.map((fileName) => ({ fileName, reason: UNPLAYABLE_REASON }))];
  const added = summary.added.length - unplayable.length;
  const parts: string[] = [];
  if (added > 0) parts.push(`Added ${added} ${added === 1 ? 'sound' : 'sounds'}.`);
  if (summary.alreadyAdded > 0) parts.push(`${summary.alreadyAdded} already in your sounds.`);
  rejected.forEach(({ fileName, reason }) => parts.push(`${fileName}: ${reason}`));
  if (parts.length === 0) return null;
  return { kind: rejected.length > 0 ? 'error' : 'info', text: parts.join(' ') };
}
