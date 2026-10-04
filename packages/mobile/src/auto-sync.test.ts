import { beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok, type CloudAccount, type Result, type SyncSummary } from '@taking-book/core';
import { AUTO_SYNC_INTERVAL_MS, createAutoSync, type AutoSync } from './auto-sync';
import type { CloudSync } from './cloud-sync';

const SUMMARY: SyncSummary = { added: 1, updated: 0, deleted: 0, uploaded: 0, downloaded: 0, warnings: [], skippedDownloads: [] };
const ACCOUNT: CloudAccount = { providerId: 'google-drive', displayName: 'Reader', email: 'r@example.com' };

describe('createAutoSync', () => {
  let account: CloudAccount | null;
  let runSync: ReturnType<typeof vi.fn<() => Promise<Result<SyncSummary>>>>;
  let activeListener: (active: boolean) => void;
  let timers: Map<number, () => void>;
  let nextTimer: number;
  let log: ReturnType<typeof vi.fn>;
  let autoSync: AutoSync;
  let finished: Result<SyncSummary>[];

  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    account = ACCOUNT;
    runSync = vi.fn(async () => ok(SUMMARY));
    timers = new Map();
    nextTimer = 0;
    log = vi.fn();
    finished = [];
    const cloud: CloudSync = {
      getCloudAccount: async () => ok(account),
      connectCloud: async () => err('unused'),
      disconnectCloud: async () => ok(undefined),
      runSync,
      onDeviceCode: () => () => undefined,
    };
    autoSync = createAutoSync({
      cloud,
      watchAppActive: (listener) => {
        activeListener = listener;
        return () => undefined;
      },
      setTimer: (callback, milliseconds) => {
        expect(milliseconds).toBe(AUTO_SYNC_INTERVAL_MS);
        timers.set(++nextTimer, callback);
        return nextTimer;
      },
      clearTimer: (handle) => void timers.delete(handle as number),
      log,
    });
    autoSync.onSyncComplete((result) => finished.push(result));
  });

  it('syncs at launch when Drive is connected and tells the listeners', async () => {
    autoSync.start();
    await flush();

    expect(runSync).toHaveBeenCalledTimes(1);
    expect(finished).toEqual([ok(SUMMARY)]);
  });

  it('syncs again when the reader returns to the app', async () => {
    autoSync.start();
    await flush();

    activeListener(false);
    activeListener(true);
    await flush();

    expect(runSync).toHaveBeenCalledTimes(2);
  });

  it('repeats on the 30-minute timer while the app is open', async () => {
    autoSync.start();
    await flush();

    [...timers.values()][0]();
    await flush();

    expect(AUTO_SYNC_INTERVAL_MS).toBe(1_800_000);
    expect(runSync).toHaveBeenCalledTimes(2);
  });

  it('keeps one timer however often the reader returns', () => {
    autoSync.start();
    activeListener(true);
    activeListener(true);

    expect(timers.size).toBe(1);
  });

  it('stops the timer while the app is in the background and when stopped', () => {
    const stop = autoSync.start();
    expect(timers.size).toBe(1);

    activeListener(false);
    expect(timers.size).toBe(0);

    activeListener(true);
    stop();
    expect(timers.size).toBe(0);
  });

  it('does nothing when Drive is not connected', async () => {
    account = null;

    autoSync.start();
    await flush();
    activeListener(true);
    await flush();

    expect(runSync).not.toHaveBeenCalled();
    expect(finished).toEqual([]);
  });

  it('logs a failed sync and keeps going', async () => {
    runSync.mockResolvedValueOnce(err('offline'));

    autoSync.start();
    await flush();
    [...timers.values()][0]();
    await flush();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('offline'));
    expect(runSync).toHaveBeenCalledTimes(2);
  });
});
