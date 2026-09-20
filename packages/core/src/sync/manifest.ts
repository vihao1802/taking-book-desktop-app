import { resolveAnnotationUid } from '../annotationUid';
import type { SyncAnnotation, SyncManifest, SyncRecord } from './types';

/**
 * Serialization for the on-disk manifest. Kept in its own module so corrupt or
 * unknown-version manifests degrade to an empty manifest instead of crashing
 * the sync (a bad cloud file must never block reading locally).
 */

const CURRENT_VERSION = 1;

const COLORS: readonly string[] = ['yellow', 'green', 'blue', 'pink'];

function isValidAnnotation(value: unknown): value is SyncAnnotation {
  if (typeof value !== 'object' || value === null) return false;
  const annotation = value as Record<string, unknown>;
  return (
    typeof annotation.id === 'number' &&
    (annotation.uid == null || typeof annotation.uid === 'string') &&
    typeof annotation.page === 'number' &&
    (annotation.pageStart == null || typeof annotation.pageStart === 'number') &&
    (annotation.pageEnd == null || typeof annotation.pageEnd === 'number') &&
    typeof annotation.quote === 'string' &&
    typeof annotation.color === 'string' &&
    COLORS.includes(annotation.color) &&
    (annotation.note == null || typeof annotation.note === 'string') &&
    (annotation.paraIndex == null || typeof annotation.paraIndex === 'number') &&
    (annotation.paraStart == null || typeof annotation.paraStart === 'number') &&
    (annotation.paraEnd == null || typeof annotation.paraEnd === 'number') &&
    typeof annotation.updatedAt === 'number' &&
    typeof annotation.updatedBy === 'string' &&
    typeof annotation.deleted === 'boolean'
  );
}

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
    (record.favorite == null || typeof record.favorite === 'boolean') &&
    (record.lastPage == null || typeof record.lastPage === 'number') &&
    (record.lastPosition == null || typeof record.lastPosition === 'number') &&
    (record.lastMode == null || record.lastMode === 'page' || record.lastMode === 'reflow') &&
    (record.pageCount == null || typeof record.pageCount === 'number') &&
    (record.reflowZoom == null || typeof record.reflowZoom === 'number') &&
    (record.annotations == null || (Array.isArray(record.annotations) && record.annotations.every(isValidAnnotation)))
  );
}

/**
 * Normalizes a parsed record so newer clients tolerate manifests written by
 * older ones: missing fields (favorite, pageCount, reflowZoom, annotations) fall back to
 * defaults, and an annotation without a uid gets its deterministic one (ADR-0003).
 */
function normalizeRecord(value: SyncRecord): SyncRecord {
  return {
    ...value,
    favorite: value.favorite ?? false,
    pageCount: value.pageCount ?? null,
    lastMode: value.lastMode ?? null,
    reflowZoom: value.reflowZoom ?? null,
    annotations: (value.annotations ?? []).map((annotation) => ({
      ...annotation,
      uid: resolveAnnotationUid(value.hash, annotation),
    })),
  };
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
  const records = obj.records.filter(isValidRecord).map(normalizeRecord);
  return { version: CURRENT_VERSION, records };
}

/** Returns an empty manifest for a cloud drive that has never synced. */
export function emptyManifest(): SyncManifest {
  return { version: CURRENT_VERSION, records: [] };
}
