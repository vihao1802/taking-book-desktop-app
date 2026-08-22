import type { Result } from '../result';
import { err, ok } from '../result';
import type { SqlDriver } from '../sql';
import { parseManifest, serializeManifest } from './manifest';
import { mergeRecords } from './merge';
import { applySyncRecords, listRecordsForSync } from './syncRepository';
import type { SyncRecord, SyncStorage, SyncSummary } from './types';
import { utf8Decode, utf8Encode } from './utf8';

/**
 * Local-first sync against a cloud-drive folder. A failed remote read aborts
 * without touching the local database; local records are always applied first
 * so reading is never blocked. Only the manifest round-trip (pull -> merge ->
 * apply -> push) plus best-effort blob reconciliation is performed.
 */

export interface SyncLibraryOptions {
  local: SyncStorage;
  remote: SyncStorage;
  resolveLocalPath: (hash: string) => string | Promise<string>;
  logWarning?: (message: string) => void;
}

function recordCounts(
  before: SyncRecord[],
  after: SyncRecord[],
): { added: number; updated: number; deleted: number } {
  const beforeByHash = new Map(before.map((r) => [r.hash, r]));
  const afterByHash = new Map(after.map((r) => [r.hash, r]));
  let added = 0;
  let updated = 0;
  let deleted = 0;
  for (const record of after) {
    const prev = beforeByHash.get(record.hash);
    if (!prev) added += 1;
    else if (record.deleted && !prev.deleted) deleted += 1;
    else if (
      record.title !== prev.title ||
      record.status !== prev.status ||
      record.tags.join('|') !== prev.tags.join('|') ||
      record.favorite !== prev.favorite ||
      record.lastPage !== prev.lastPage ||
      record.lastPosition !== prev.lastPosition ||
      record.lastMode !== prev.lastMode ||
      record.pageCount !== prev.pageCount ||
      JSON.stringify(record.annotations) !== JSON.stringify(prev.annotations) ||
      record.deleted !== prev.deleted
    ) {
      updated += 1;
    }
  }
  return { added, updated, deleted };
}

/**
 * Runs one sync pass. Returns a summary of what changed; on remote failure the
 * local library is left untouched and the error explains why.
 */
export async function syncLibrary(
  db: SqlDriver,
  options: SyncLibraryOptions,
): Promise<Result<SyncSummary>> {
  const { local, remote, resolveLocalPath, logWarning } = options;
  const warn = logWarning ?? (() => undefined);
  const summary: SyncSummary = {
    added: 0,
    updated: 0,
    deleted: 0,
    uploaded: 0,
    downloaded: 0,
    warnings: [],
  };

  const localRecordsResult = await listRecordsForSync(db);
  if (!localRecordsResult.ok) return localRecordsResult;
  const localRecords = localRecordsResult.data;

  const remoteRaw = await remote.readFile('manifest.json');
  if (!remoteRaw.ok) return err(`Sync failed reading remote manifest: ${remoteRaw.error}`);
  const remoteManifest = remoteRaw.data ? parseManifest(utf8Decode(remoteRaw.data)) : null;
  const remoteRecords = remoteManifest ? remoteManifest.records : [];

  const merged = mergeRecords(localRecords, remoteRecords);

  const applyResult = await applySyncRecords(db, merged, async (hash) => {
    const path = await resolveLocalPath(hash);
    return path;
  });
  if (!applyResult.ok) return applyResult;

  summary.added = applyResult.data.added;
  summary.updated = applyResult.data.updated;
  summary.deleted = applyResult.data.deleted;

  const manifestBytes = utf8Encode(serializeManifest({ version: 1, records: merged }));
  const writeResult = await remote.writeFile('manifest.json', manifestBytes);
  if (!writeResult.ok) {
    warn(`Sync applied locally but failed writing remote manifest: ${writeResult.error}`);
    summary.warnings.push(writeResult.error);
  }

  await reconcileBlobs(merged, local, remote, summary, warn);
  return ok(summary);
}

async function reconcileBlobs(
  records: SyncRecord[],
  local: SyncStorage,
  remote: SyncStorage,
  summary: SyncSummary,
  warn: (message: string) => void,
): Promise<void> {
  for (const record of records) {
    const key = `blobs/${record.hash}`;
    const [localBlob, remoteBlob] = await Promise.all([
      local.readFile(key),
      remote.readFile(key),
    ]);
    if (localBlob.ok && remoteBlob.ok) {
      if (record.deleted) {
        if (remoteBlob.data) {
          const del = await remote.deleteFile(key);
          if (!del.ok) warn(`Failed deleting remote blob for ${record.hash}: ${del.error}`);
        }
        continue;
      }
      if (!localBlob.data && remoteBlob.data) {
        const write = await local.writeFile(key, remoteBlob.data);
        if (write.ok) summary.downloaded += 1;
        else warn(`Failed downloading ${record.hash}: ${write.error}`);
      } else if (localBlob.data && !remoteBlob.data) {
        const write = await remote.writeFile(key, localBlob.data);
        if (write.ok) summary.uploaded += 1;
        else warn(`Failed uploading ${record.hash}: ${write.error}`);
      }
    } else if (!localBlob.ok) {
      warn(`Local blob check failed for ${record.hash}: ${localBlob.error}`);
      summary.warnings.push(`blob check failed for ${record.hash}`);
    } else if (!remoteBlob.ok) {
      warn(`Remote blob check failed for ${record.hash}: ${remoteBlob.error}`);
      summary.warnings.push(`blob check failed for ${record.hash}`);
    }
  }
}
