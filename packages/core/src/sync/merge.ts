import type { SyncRecord, SyncStamp } from './types';

/**
 * Pure last-write-wins merge for sync records.
 *
 * Records are keyed by content hash. A record with a higher `updatedAt` wins;
 * on an exact timestamp tie the lexicographically higher `updatedBy` (device
 * id) wins, keeping the merge deterministic across devices. Deleted records
 * are ordinary records, so a newer tombstone deletes an older live record and
 * a newer live record resurrects an older tombstone.
 */

/** Returns the winner between two records with the same hash. */
export function pickWinner(local: SyncRecord, remote: SyncRecord): SyncRecord {
  if (remote.updatedAt !== local.updatedAt) {
    return remote.updatedAt > local.updatedAt ? remote : local;
  }
  if (remote.updatedBy !== local.updatedBy) {
    return remote.updatedBy > local.updatedBy ? remote : local;
  }
  return local;
}

/**
 * Merges a local and a remote record list into a single manifest record list.
 * The result contains exactly one record per hash present on either side.
 */
export function mergeRecords(local: SyncRecord[], remote: SyncRecord[]): SyncRecord[] {
  const byHash = new Map<string, SyncRecord>();
  for (const record of local) byHash.set(record.hash, record);
  for (const record of remote) {
    const existing = byHash.get(record.hash);
    byHash.set(record.hash, existing ? pickWinner(existing, record) : record);
  }
  return [...byHash.values()];
}

/** True if `a` is strictly newer than `b` under the LWW clock. */
export function isNewerThan(a: SyncStamp, b: SyncStamp): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return a.updatedBy > b.updatedBy;
}
