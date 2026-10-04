import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { err, ok, type CloudAuthStore, type Result, type StoredCloudAuth } from '@taking-book/core';

const AUTH_KEY = 'cloud.google-drive.auth';

/** Where one secret string is kept; the platform's protected storage in the app. */
export interface SecretStore {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** The Android keystore-backed secure storage plugin. */
export const capacitorSecretStore: SecretStore = {
  read: (key) => SecureStorage.getItem(key),
  write: (key, value) => SecureStorage.setItem(key, value),
  remove: (key) => SecureStorage.removeItem(key),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isStoredAuth(value: unknown): value is StoredCloudAuth {
  if (typeof value !== 'object' || value === null) return false;
  const { token, account } = value as { token?: { accessToken?: unknown }; account?: unknown };
  return typeof token?.accessToken === 'string' && typeof account === 'object' && account !== null;
}

/**
 * Keeps the Google sign-in in the platform's protected storage, never in the
 * app database, so the refresh token is not readable from a copy of the library.
 *
 * @param secrets The protected storage to use.
 * @returns A store for the sign-in; storage failures are error results.
 */
export function createSecureAuthStore(secrets: SecretStore): CloudAuthStore {
  return {
    async getAuth(): Promise<Result<StoredCloudAuth | null>> {
      try {
        const raw = await secrets.read(AUTH_KEY);
        if (raw === null || raw === '') return ok(null);
        const parsed: unknown = JSON.parse(raw);
        return isStoredAuth(parsed) ? ok(parsed) : ok(null);
      } catch (error) {
        console.error(`Could not read the stored Google sign-in: ${errorMessage(error)}`);
        return err('The stored Google sign-in could not be read; connect Google Drive again.');
      }
    },
    async setAuth(auth): Promise<Result<void>> {
      try {
        await secrets.write(AUTH_KEY, JSON.stringify(auth));
        return ok(undefined);
      } catch (error) {
        console.error(`Could not store the Google sign-in: ${errorMessage(error)}`);
        return err('The Google sign-in could not be saved on this device.');
      }
    },
    async clearAuth(): Promise<Result<void>> {
      try {
        await secrets.remove(AUTH_KEY);
        return ok(undefined);
      } catch (error) {
        console.error(`Could not forget the Google sign-in: ${errorMessage(error)}`);
        return err('The Google sign-in could not be removed from this device.');
      }
    },
  };
}
