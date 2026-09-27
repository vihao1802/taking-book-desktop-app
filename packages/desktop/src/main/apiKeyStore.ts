import { safeStorage } from 'electron';
import { err, getSetting, ok, setSetting, type Result, type SqlDriver } from '@taking-book/core';

const AI_API_KEY_KEY = 'ai.apiKey';

/**
 * The reader's own API key for the AI provider (ADR-0007), stored in the
 * settings table. When the OS keychain is available (safeStorage) it is
 * encrypted at rest; otherwise it degrades to plaintext with a loud warning,
 * the same tradeoff `cloud/tokenStore.ts` makes for the Google auth bundle.
 * The renderer only ever calls `hasKey`/`setKey`/`clearKey`: `getKey` is for
 * the main process's own use when it calls the AI provider, and must never
 * be wired to an IPC channel.
 */
export interface ApiKeyStore {
  /** Whether a key is currently saved; never reveals the key itself. */
  hasKey(): Promise<Result<boolean>>;
  /** Saves (or replaces) the key; an empty or whitespace-only key is rejected. */
  setKey(key: string): Promise<Result<void>>;
  /** Removes the saved key, if any. */
  clearKey(): Promise<Result<void>>;
  /** The saved key in the clear, for calling the AI provider; null when none is saved. */
  getKey(): Promise<Result<string | null>>;
}

export function createApiKeyStore(db: SqlDriver): ApiKeyStore {
  const encrypted = safeStorage.isEncryptionAvailable();
  if (!encrypted) {
    console.warn('[settings] safeStorage unavailable; the AI API key is NOT encrypted on disk');
  }

  return {
    async hasKey(): Promise<Result<boolean>> {
      const row = await getSetting(db, AI_API_KEY_KEY);
      if (!row.ok) return row;
      return ok(Boolean(row.data));
    },

    async setKey(key: string): Promise<Result<void>> {
      const trimmed = key.trim();
      if (!trimmed) return err('An API key cannot be empty.');
      const value = encrypted ? safeStorage.encryptString(trimmed).toString('base64') : trimmed;
      return setSetting(db, AI_API_KEY_KEY, value);
    },

    async clearKey(): Promise<Result<void>> {
      return setSetting(db, AI_API_KEY_KEY, '');
    },

    async getKey(): Promise<Result<string | null>> {
      const row = await getSetting(db, AI_API_KEY_KEY);
      if (!row.ok) return row;
      if (!row.data) return ok(null);
      try {
        return ok(encrypted ? safeStorage.decryptString(Buffer.from(row.data, 'base64')) : row.data);
      } catch (error) {
        // Never include the raw stored value in the error: it may be
        // undecryptable ciphertext, but it is still a secret-shaped string.
        return err(`Stored AI API key is unreadable: ${errorMessage(error)}`);
      }
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
