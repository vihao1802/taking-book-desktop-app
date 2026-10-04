import type { Result, SyncSummary } from '@taking-book/core';
import type { CloudSync } from './cloud-sync';

/** How often to sync while the app is open (ADR-0010). */
export const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** The notice the reader API gives the renderer when an automatic sync finishes. */
export interface AutoSyncEvents {
  onSyncComplete(listener: (result: Result<SyncSummary>) => void): () => void;
}

export interface AutoSyncOptions {
  cloud: CloudSync;
  /** Reports whether the app is in the foreground, now and on every change; returns the unsubscribe. */
  watchAppActive: (listener: (active: boolean) => void) => () => void;
  setTimer: (callback: () => void, milliseconds: number) => unknown;
  clearTimer: (handle: unknown) => void;
  log: (message: string) => void;
}

/** Syncs by itself while the app is open; there is no background service. */
export interface AutoSync extends AutoSyncEvents {
  /** Starts syncing now and while the app stays open; returns a function that stops everything. */
  start(): () => void;
}

/**
 * Runs a sync when the app launches, whenever the reader returns to it, and
 * every 30 minutes while it is in the foreground. Nothing runs while the app is
 * in the background, and nothing runs at all when Google Drive is not connected.
 *
 * @param options The cloud sync, the app-visibility source and the timers.
 * @returns The automatic sync, not started yet.
 */
export function createAutoSync(options: AutoSyncOptions): AutoSync {
  const { cloud, setTimer, clearTimer, log } = options;
  const listeners = new Set<(result: Result<SyncSummary>) => void>();

  async function syncIfConnected(): Promise<void> {
    try {
      const account = await cloud.getCloudAccount();
      if (!account.ok || account.data === null) return;
      const result = await cloud.runSync();
      if (!result.ok) log(`automatic sync failed: ${result.error}`);
      listeners.forEach((listener) => listener(result));
    } catch (error) {
      log(`automatic sync failed unexpectedly: ${String(error)}`);
    }
  }

  return {
    onSyncComplete: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => {
      let timer: unknown = null;
      const stopTimer = (): void => {
        if (timer !== null) clearTimer(timer);
        timer = null;
      };
      const whileOpen = (): void => {
        stopTimer();
        void syncIfConnected();
        timer = setTimer(() => void syncIfConnected(), AUTO_SYNC_INTERVAL_MS);
      };
      whileOpen();
      const unwatch = options.watchAppActive((active) => (active ? whileOpen() : stopTimer()));
      return () => {
        unwatch();
        stopTimer();
      };
    },
  };
}
