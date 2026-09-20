import { sha256Hex } from './sha256';
import { utf8Encode } from './sync/utf8';

/**
 * Produces a new globally unique annotation identity. Core has no platform
 * randomness, so the caller (the desktop app, later mobile) supplies it.
 */
export type AnnotationUidGenerator = () => string;

/**
 * Derives the identity of an annotation that predates uids from its book and
 * its old local id. It is deterministic on purpose: two devices that upgrade
 * independently must give the same old annotation the same uid, or sync would
 * duplicate it (ADR-0003).
 *
 * @param fileHash Content hash of the book the annotation belongs to.
 * @param id The annotation's old local integer id.
 * @returns A lowercase hex SHA-256 digest of `fileHash:id`.
 */
export function deriveAnnotationUid(fileHash: string, id: number): string {
  return sha256Hex(utf8Encode(`${fileHash}:${id}`));
}

/**
 * Returns the identity of an annotation that may have come from an older
 * build: its own `uid` when it has one, otherwise the derived one.
 *
 * @param fileHash Content hash of the book the annotation belongs to.
 * @param annotation Anything carrying the old local `id` and an optional `uid`.
 * @returns The annotation's stable identity.
 */
export function resolveAnnotationUid(
  fileHash: string,
  annotation: { id: number; uid?: string | null },
): string {
  return annotation.uid ?? deriveAnnotationUid(fileHash, annotation.id);
}
