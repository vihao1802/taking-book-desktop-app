import type { SkippedDownload } from '@taking-book/core';

/**
 * Words the PDFs a sync did not download for the Library's sync line. Network
 * and storage reasons hold for every Book, so each is said once with a count;
 * oversize Books are named because only desktop can open them.
 *
 * @param skipped The PDFs the last sync skipped.
 * @returns Messages for the reader, empty when nothing was skipped.
 */
export function describeSkippedDownloads(skipped: SkippedDownload[]): string[] {
  const messages: string[] = [];
  for (const reason of ['storage', 'network'] as const) {
    const matching = skipped.filter((item) => item.reason === reason);
    if (matching.length > 0) messages.push(`${matching.length} PDF${matching.length === 1 ? '' : 's'} not downloaded. ${matching[0].message}`);
  }
  for (const item of skipped.filter((entry) => entry.reason === 'size')) messages.push(`${item.title}: ${item.message}`);
  return messages;
}
