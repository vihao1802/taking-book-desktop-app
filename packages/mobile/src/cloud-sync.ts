import {
  err,
  ok,
  syncLibrary,
  type CloudAccount,
  type BlobTransferPolicy,
  type CloudProvider,
  type DeviceCodePrompt,
  type Result,
  type SqlDriver,
  type SyncStorage,
  type SyncSummary,
} from '@taking-book/core';

/** The cloud methods of the reader API, as the Android app implements them. */
export interface CloudSync {
  getCloudAccount(): Promise<Result<CloudAccount | null>>;
  connectCloud(): Promise<Result<CloudAccount>>;
  disconnectCloud(): Promise<Result<void>>;
  runSync(): Promise<Result<SyncSummary>>;
  onDeviceCode(listener: (prompt: DeviceCodePrompt) => void): () => void;
}

export interface CloudSyncOptions {
  db: SqlDriver;
  /** The Drive provider; null in a build that has no Google OAuth client. */
  provider: CloudProvider | null;
  /** This device's copy of the Books, addressed like the Drive folder. */
  localStorage: SyncStorage;
  resolveLocalPath: (hash: string) => string;
  /** Which PDFs this device downloads; the manifest syncs regardless. */
  blobTransfer: BlobTransferPolicy;
  /** Copies the code and opens the verification page when a sign-in code appears. */
  presentDeviceCode: (prompt: DeviceCodePrompt) => Promise<void>;
  log: (message: string) => void;
}

const NOT_SET_UP = 'Google Drive sync is not set up in this build of the app.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Connects Google Drive with the device flow and syncs the Library with the
 * Drive folder: the manifest (the Library, Last-read positions and Annotations)
 * always, and PDFs as far as the transfer policy allows. A failed sync leaves the local library
 * untouched and comes back as an error result, so reading is never blocked.
 *
 * @param options The database, the provider and the device's storage.
 * @returns The cloud methods of the Android reader API.
 */
export function createCloudSync(options: CloudSyncOptions): CloudSync {
  const { db, provider, log } = options;
  const listeners = new Set<(prompt: DeviceCodePrompt) => void>();
  let running: Promise<Result<SyncSummary>> | null = null;

  async function sync(): Promise<Result<SyncSummary>> {
    if (!provider) return err(NOT_SET_UP);
    try {
      const remote = await provider.createSyncStorage();
      if (!remote.ok) return remote;
      const summary = await syncLibrary(db, {
        local: options.localStorage,
        remote: remote.data,
        resolveLocalPath: options.resolveLocalPath,
        blobTransfer: options.blobTransfer,
        logWarning: (message) => log(`sync: ${message}`),
      });
      if (!summary.ok) log(`sync failed: ${summary.error}`);
      return summary;
    } catch (error) {
      log(`sync failed unexpectedly: ${errorMessage(error)}`);
      return err('The sync could not finish. Your library on this device is unchanged.');
    }
  }

  return {
    getCloudAccount: () => (provider ? provider.getAccount() : Promise.resolve(ok(null))),
    connectCloud: () => {
      if (!provider) return Promise.resolve(err(NOT_SET_UP));
      return provider.connect({
        onDeviceCode: (prompt) => {
          listeners.forEach((listener) => listener(prompt));
          void options.presentDeviceCode(prompt);
        },
      });
    },
    disconnectCloud: () => (provider ? provider.disconnect() : Promise.resolve(ok(undefined))),
    // A sync already under way is joined, so a tap during an automatic sync does not start a second one.
    runSync: () => {
      running ??= sync().finally(() => {
        running = null;
      });
      return running;
    },
    onDeviceCode: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
