import type { SyncManifest, SyncRecord } from './types';

/**
 * Serialization for the on-disk manifest. Kept in its own module so corrupt or
 * unknown-version manifests degrade to an empty manifest instead of crashing
 * the sync (a bad cloud file must never block reading locally).
 */

const CURRENT_VERSION = 1;

function isValidRecord(value: unknown): value is SyncRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.hash === 'string' &&
    typeof record.title === 'string' &&
    (record.status === 'unread' || record.status === 'reading' || record.status === 'finished') &&
    Array.isArray(record.tags) &&
    typeof record.updatedAt === 'number' &&
    typeof record.updatedBy === 'string' &&
    typeof record.deleted === 'boolean' &&
    (record.lastPage == null || typeof record.lastPage === 'number') &&
    (record.lastPosition == null || typeof record.lastPosition === 'number')
  );
}

/** Serializes a manifest to its JSON string form. */
export function serializeManifest(manifest: SyncManifest): string {
  return JSON.stringify(manifest);
}

/**
 * Parses a manifest JSON string. Returns `null` when the payload is not a
 * valid manifest (missing, corrupt, or a future version), so callers can treat
 * it as an empty remote state.
 */
export function parseManifest(raw: string): SyncManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== CURRENT_VERSION || !Array.isArray(obj.records)) return null;
  const records = obj.records.filter(isValidRecord);
  return { version: CURRENT_VERSION, records };
}

/** Returns an empty manifest for a cloud drive that has never synced. */
export function emptyManifest(): SyncManifest {
  return { version: CURRENT_VERSION, records: [] };
}
