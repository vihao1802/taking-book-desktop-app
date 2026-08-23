import type { SqlDriver } from '@taking-book/core';
import { syncIfConnected } from './sync';

/**
 * Keeps the library in sync with the connected cloud account in the
 * background: once shortly after launch and then on a fixed interval. Each
 * pass is a no-op when no account is connected, and core guarantees a failed
 * sync never blocks reading or corrupts local state, so this is safe to run
 * unsupervised.
 */

const STARTUP_DELAY_MS = 5_000;
const INTERVAL_MS = 30 * 60 * 1000;

export function startBackgroundSync(db: SqlDriver, userDataDir: string): void {
  const syncOnce = () => void syncIfConnected(db, userDataDir);
  setTimeout(syncOnce, STARTUP_DELAY_MS);
  setInterval(syncOnce, INTERVAL_MS);
}
