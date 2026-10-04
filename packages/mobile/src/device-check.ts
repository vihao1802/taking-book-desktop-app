import { describeSqlDriverContract, type SqlDriver } from '@taking-book/core';
import { openConnection } from './open-database';

const CHECK_DATABASE_NAME = 'taking-book-device-check';

export interface DeviceCheckOutcome {
  name: string;
  /** Null when the check passed, otherwise why it failed. */
  failure: string | null;
}

/**
 * Runs the shared `SqlDriver` contract against a driver and collects the
 * outcome of each test instead of reporting through a test runner.
 *
 * @param driver An empty database; the contract uses a table named `items`.
 * @returns One outcome per contract test, in order.
 */
export async function runDriverContract(driver: SqlDriver): Promise<DeviceCheckOutcome[]> {
  const tests: Array<{ name: string; run: () => Promise<void> }> = [];
  describeSqlDriverContract(
    {
      describe: (_name, define) => define(),
      it: (name, run) => tests.push({ name, run }),
    },
    async () => {
      await driver.exec('DROP TABLE IF EXISTS items');
      return driver;
    },
  );

  const outcomes: DeviceCheckOutcome[] = [];
  for (const test of tests) {
    try {
      await test.run();
      outcomes.push({ name: test.name, failure: null });
    } catch (error) {
      outcomes.push({ name: test.name, failure: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

/**
 * Runs the driver contract on the real Capacitor SQLite plugin and logs one
 * `TB_DEVICE_CHECK` line per test plus a final `DONE` line, which
 * `scripts/device-check.mjs` reads from logcat. Only built into the app when
 * `VITE_TB_DEVICE_CHECK` is set; it uses its own database, never the reader's.
 */
export async function runDeviceCheck(): Promise<void> {
  let outcomes: DeviceCheckOutcome[];
  try {
    outcomes = await runDriverContract(await openConnection(CHECK_DATABASE_NAME));
  } catch (error) {
    console.log(`TB_DEVICE_CHECK: DONE passed=0 failed=1 (could not start: ${String(error)})`);
    return;
  }
  for (const outcome of outcomes) {
    console.log(`TB_DEVICE_CHECK: ${outcome.failure === null ? 'PASS' : `FAIL ${outcome.failure} --`} ${outcome.name}`);
  }
  const failed = outcomes.filter((outcome) => outcome.failure !== null).length;
  console.log(`TB_DEVICE_CHECK: DONE passed=${outcomes.length - failed} failed=${failed}`);
}
