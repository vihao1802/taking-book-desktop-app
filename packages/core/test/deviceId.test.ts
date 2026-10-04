import { describe, expect, it } from 'vitest';
import { getDeviceId, isErr } from '../src';
import { createMemoryDriver } from './helpers';
import { startDatabase } from '../src';

describe('getDeviceId', () => {
  it('creates an id the first time and returns the same one afterwards', async () => {
    const db = createMemoryDriver();
    await startDatabase(db);
    const first = await getDeviceId(db, () => 'device-1');
    const second = await getDeviceId(db, () => 'device-2');
    expect(first).toEqual({ ok: true, data: 'device-1' });
    expect(second).toEqual({ ok: true, data: 'device-1' });
  });

  it('reports an error when the database cannot be read', async () => {
    const db = createMemoryDriver();
    const result = await getDeviceId(db, () => 'device-1');
    expect(isErr(result)).toBe(true);
  });
});
