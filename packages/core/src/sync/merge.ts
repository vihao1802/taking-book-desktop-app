import { resolveAnnotationUid } from '../annotationUid';
import type { SyncAnnotation, SyncRecord, SyncStamp } from './types';

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
 * Merges two annotation lists of the same book per annotation identity: the
 * newer of two versions of one `uid` wins (a tie keeps the local one), and an
 * annotation present on only one side is kept. Annotations without a `uid`
 * get their deterministic one first, so lists from older builds line up.
 */
export function mergeAnnotations(
  fileHash: string,
  local: SyncAnnotation[],
  remote: SyncAnnotation[],
): SyncAnnotation[] {
  const byUid = new Map<string, SyncAnnotation>();
  for (const annotation of [...local, ...remote]) {
    const uid = resolveAnnotationUid(fileHash, annotation);
    const existing = byUid.get(uid);
    if (!existing || isNewerThan(annotation, existing)) byUid.set(uid, { ...annotation, uid });
  }
  return [...byUid.values()];
}

/**
 * Merges a local and a remote record list into a single manifest record list.
 * The result contains exactly one record per hash present on either side. The
 * newer record decides the book's own fields, but annotations are merged per
 * annotation: adding one on a device never touches the book's clock, so the
 * record winner alone would silently drop the other device's annotations.
 */
export function mergeRecords(local: SyncRecord[], remote: SyncRecord[]): SyncRecord[] {
  const byHash = new Map<string, SyncRecord>();
  for (const record of local) byHash.set(record.hash, record);
  for (const record of remote) {
    const existing = byHash.get(record.hash);
    if (!existing) {
      byHash.set(record.hash, record);
      continue;
    }
    const winner = pickWinner(existing, record);
    const annotations = mergeAnnotations(record.hash, existing.annotations, record.annotations);
    const unchanged = JSON.stringify(annotations) === JSON.stringify(winner.annotations);
    byHash.set(record.hash, unchanged ? winner : { ...winner, annotations });
  }
  return [...byHash.values()];
}

/** True if `a` is strictly newer than `b` under the LWW clock. */
export function isNewerThan(a: SyncStamp, b: SyncStamp): boolean {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return a.updatedBy > b.updatedBy;
}
