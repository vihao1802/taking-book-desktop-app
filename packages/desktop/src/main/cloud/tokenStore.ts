import { safeStorage } from 'electron';
import { err, getSetting, ok, setSetting, type CloudAccount, type CloudToken, type Result, type SqlDriver } from '@taking-book/core';

const AUTH_KEY = 'cloud.google-drive.auth';

/**
 * The persisted auth bundle: the OAuth token plus the account it belongs to,
 * stored in the settings table. When the OS keychain is available
 * (safeStorage) the JSON is encrypted at rest; otherwise it degrades to
 * plaintext with a loud warning so sync keeps working on minimal systems.
 */
export interface StoredCloudAuth {
  token: CloudToken;
  account: CloudAccount;
}

export interface CloudTokenStore {
  getAuth(): Promise<Result<StoredCloudAuth | null>>;
  setAuth(auth: StoredCloudAuth): Promise<Result<void>>;
  clearAuth(): Promise<Result<void>>;
}

export function createCloudTokenStore(db: SqlDriver): CloudTokenStore {
  const encrypted = safeStorage.isEncryptionAvailable();
  if (!encrypted) {
    console.warn('[cloud] safeStorage unavailable; Google tokens are NOT encrypted on disk');
  }

  return {
    async getAuth(): Promise<Result<StoredCloudAuth | null>> {
      const row = await getSetting(db, AUTH_KEY);
      if (!row.ok) return row;
      if (!row.data) return ok(null);
      try {
        const json = encrypted ? safeStorage.decryptString(Buffer.from(row.data, 'base64')) : row.data;
        const parsed = JSON.parse(json) as StoredCloudAuth;
        if (typeof parsed.token?.accessToken !== 'string') return ok(null);
        return ok(parsed);
      } catch (error) {
        return err(`Stored Google auth is unreadable: ${errorMessage(error)}`);
      }
    },
    async setAuth(auth: StoredCloudAuth): Promise<Result<void>> {
      const json = JSON.stringify(auth);
      const value = encrypted ? safeStorage.encryptString(json).toString('base64') : json;
      return setSetting(db, AUTH_KEY, value);
    },
    async clearAuth(): Promise<Result<void>> {
      return setSetting(db, AUTH_KEY, '');
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
