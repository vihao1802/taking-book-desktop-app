import { isOk, ok, type Result } from './result';
import { getSetting, setSetting } from './settingsRepository';
import type { SqlDriver } from './sql';

const DEVICE_KEY = 'deviceId';

/**
 * Returns this device's persisted id, creating one the first time. The id
 * stamps every local edit for the sync clock, so it must stay stable.
 *
 * @param db The started database.
 * @param generateId Supplies a fresh unique id; core has no platform randomness of its own.
 * @returns The id, or an error when it could not be stored.
 */
export async function getDeviceId(db: SqlDriver, generateId: () => string): Promise<Result<string>> {
  const existing = await getSetting(db, DEVICE_KEY);
  if (!isOk(existing)) return existing;
  if (existing.data) return ok(existing.data);
  const id = generateId();
  const saved = await setSetting(db, DEVICE_KEY, id);
  return isOk(saved) ? ok(id) : saved;
}
