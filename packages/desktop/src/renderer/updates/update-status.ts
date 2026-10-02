import type { AvailableUpdate } from '@taking-book/core';

/** Where a check the reader started from Settings stands. */
export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: AvailableUpdate }
  | { kind: 'downloading'; update: AvailableUpdate }
  | { kind: 'failed' };

/** The line shown under the Check for updates button, or null before the first check. */
export function describeUpdateStatus(status: UpdateStatus): string | null {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return 'You have the latest version.';
    case 'available':
      return `Taking Book ${status.update.version} is available.`;
    case 'downloading':
      return 'Downloading the update…';
    case 'failed':
      // The main process logs the real cause; offline is by far the usual one.
      return 'Could not check for updates. Check your internet connection and try again.';
  }
}
