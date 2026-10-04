import { describe, expect, it } from 'vitest';
import { createCapacitorSqlDriver } from './capacitor-sql-driver';
import { runDriverContract } from './device-check';
import { createFakeConnection } from './fake-sqlite-connection';

describe('runDriverContract', () => {
  it('reports every contract test as passed for a correct driver', async () => {
    const outcomes = await runDriverContract(createCapacitorSqlDriver(createFakeConnection()));
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.filter((outcome) => outcome.failure !== null)).toEqual([]);
  });

  it('reports a failure, not a throw, for a driver that joins open transactions', async () => {
    const correct = createCapacitorSqlDriver(createFakeConnection());
    // A driver with no queue lets the second transaction start inside the first.
    const unserialized = { ...correct, transaction: <T>(fn: () => Promise<T>): Promise<T> => fn() };
    const outcomes = await runDriverContract(unserialized);
    expect(outcomes.some((outcome) => outcome.failure !== null)).toBe(true);
  });
});
