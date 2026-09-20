import type { ReflowParagraph } from './reflow';
import { err, ok, type Result } from './result';

/**
 * Version of the cached reflow format. Bump it whenever the extraction or
 * paragraph-building logic changes in a way that alters the output for the same
 * PDF (anything in `reflow.ts`, or the post-processing in the desktop reflow
 * hook), so books are re-extracted instead of showing stale text.
 */
export const REFLOW_CACHE_VERSION = 4;

/** The finished result of extracting a whole document for reflow mode. */
export interface ReflowCacheEntry {
  paragraphs: ReflowParagraph[];
  /** Raw text of each page, used to anchor highlights made in page mode. */
  pageTexts: string[];
}

interface StoredReflowCache extends ReflowCacheEntry {
  version: number;
}

/** Serializes an extraction result for storage, stamped with the current cache version. */
export function serializeReflowCache(entry: ReflowCacheEntry): string {
  const stored: StoredReflowCache = { version: REFLOW_CACHE_VERSION, ...entry };
  return JSON.stringify(stored);
}

function isStoredReflowCache(value: unknown): value is StoredReflowCache {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === 'number' &&
    Array.isArray(candidate.paragraphs) &&
    Array.isArray(candidate.pageTexts)
  );
}

/**
 * Reads a serialized extraction result back.
 *
 * @param json - Text previously produced by `serializeReflowCache`.
 * @returns The entry; `null` when it was written by a different cache version
 * (a normal miss that just needs re-extraction); an error when the text is
 * corrupt, so the caller can log it and fall back to extracting.
 */
export function parseReflowCache(json: string): Result<ReflowCacheEntry | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return err(`Reflow cache is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isStoredReflowCache(parsed)) return err('Reflow cache has an unexpected shape.');
  if (parsed.version !== REFLOW_CACHE_VERSION) return ok(null);
  return ok({ paragraphs: parsed.paragraphs, pageTexts: parsed.pageTexts });
}
