import type { Result } from '../result';
import { err, ok } from '../result';
import type { SqlDriver } from '../sql';
import type { BlobTransferPolicy } from './blobTransfer';
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
  /**
   * Decides which Book files move. Without it every missing file is copied in
   * both directions, as on desktop.
   */
  blobTransfer?: BlobTransferPolicy;
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
    skippedDownloads: [],
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

  await reconcileBlobs(merged, { local, remote, policy: options.blobTransfer, summary, warn });
  return ok(summary);
}

interface BlobContext {
  local: SyncStorage;
  remote: SyncStorage;
  policy: BlobTransferPolicy | undefined;
  summary: SyncSummary;
  warn: (message: string) => void;
}

/**
 * Copies Book files to whichever side lacks them, asking the transfer policy
 * before each download. Sizes come from `statFile`, so a file is read whole
 * only when it is really going to be copied. A failure on one Book is a
 * warning and never stops the others.
 */
async function reconcileBlobs(records: SyncRecord[], context: BlobContext): Promise<void> {
  for (const record of records) {
    const key = `blobs/${record.hash}`;
    const [localStat, remoteStat] = await Promise.all([context.local.statFile(key), context.remote.statFile(key)]);
    if (!localStat.ok) {
      context.warn(`Local blob check failed for ${record.hash}: ${localStat.error}`);
      context.summary.warnings.push(`blob check failed for ${record.hash}`);
    } else if (!remoteStat.ok) {
      context.warn(`Remote blob check failed for ${record.hash}: ${remoteStat.error}`);
      context.summary.warnings.push(`blob check failed for ${record.hash}`);
    } else if (record.deleted) {
      if (remoteStat.data) await deleteRemoteBlob(context, record.hash, key);
    } else if (!localStat.data && remoteStat.data) {
      await downloadBlob(context, record, key, remoteStat.data.size);
    } else if (localStat.data && !remoteStat.data && context.policy?.uploadBooks !== false) {
      await uploadBlob(context, record.hash, key);
    }
  }
}

async function deleteRemoteBlob(context: BlobContext, hash: string, key: string): Promise<void> {
  const deleted = await context.remote.deleteFile(key);
  if (!deleted.ok) context.warn(`Failed deleting remote blob for ${hash}: ${deleted.error}`);
}

async function downloadBlob(context: BlobContext, record: SyncRecord, key: string, sizeBytes: number): Promise<void> {
  const { summary, warn } = context;
  const decision = context.policy
    ? await context.policy.decideDownload({ hash: record.hash, title: record.title, sizeBytes })
    : { download: true as const };
  if (!decision.download) {
    summary.skippedDownloads.push({ hash: record.hash, title: record.title, reason: decision.reason, message: decision.message });
    summary.warnings.push(`${record.title}: ${decision.message}`);
    return;
  }
  const bytes = await context.remote.readFile(key);
  if (!bytes.ok || !bytes.data) {
    warn(`Failed downloading ${record.hash}: ${bytes.ok ? 'the file disappeared' : bytes.error}`);
    return;
  }
  const written = await context.local.writeFile(key, bytes.data);
  if (written.ok) summary.downloaded += 1;
  else warn(`Failed downloading ${record.hash}: ${written.error}`);
}

async function uploadBlob(context: BlobContext, hash: string, key: string): Promise<void> {
  const bytes = await context.local.readFile(key);
  if (!bytes.ok || !bytes.data) {
    context.warn(`Failed uploading ${hash}: ${bytes.ok ? 'the file disappeared' : bytes.error}`);
    return;
  }
  const written = await context.remote.writeFile(key, bytes.data);
  if (written.ok) context.summary.uploaded += 1;
  else context.warn(`Failed uploading ${hash}: ${written.error}`);
}
