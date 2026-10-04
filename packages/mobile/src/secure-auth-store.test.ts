import { describe, expect, it, vi } from 'vitest';
import type { StoredCloudAuth } from '@taking-book/core';

vi.mock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: {} }));

import { createSecureAuthStore, type SecretStore } from './secure-auth-store';

const AUTH: StoredCloudAuth = {
  token: { accessToken: 'at', refreshToken: 'rt', expiresAt: 5 },
  account: { providerId: 'google-drive', displayName: 'Reader', email: 'reader@example.com' },
};

function memorySecrets(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    read: async (key) => values.get(key) ?? null,
    write: async (key, value) => void values.set(key, value),
    remove: async (key) => void values.delete(key),
  };
}

describe('createSecureAuthStore', () => {
  it('keeps the sign-in in the secret store and reads it back', async () => {
    const secrets = memorySecrets();
    const store = createSecureAuthStore(secrets);

    expect(await store.getAuth()).toEqual({ ok: true, data: null });
    expect(await store.setAuth(AUTH)).toEqual({ ok: true, data: undefined });

    expect(secrets.values.size).toBe(1);
    expect(await store.getAuth()).toEqual({ ok: true, data: AUTH });
  });

  it('forgets the sign-in when cleared', async () => {
    const secrets = memorySecrets();
    const store = createSecureAuthStore(secrets);
    await store.setAuth(AUTH);

    expect(await store.clearAuth()).toEqual({ ok: true, data: undefined });

    expect(secrets.values.size).toBe(0);
    expect(await store.getAuth()).toEqual({ ok: true, data: null });
  });

  it('treats an unrecognised stored value as not signed in', async () => {
    const secrets = memorySecrets();
    secrets.values.set('cloud.google-drive.auth', '{"unexpected":true}');

    expect(await createSecureAuthStore(secrets).getAuth()).toEqual({ ok: true, data: null });
  });

  it('turns a storage failure into an error result worded for the reader', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: SecretStore = {
      read: async () => {
        throw new Error('keystore locked');
      },
      write: async () => {
        throw new Error('keystore locked');
      },
      remove: async () => {
        throw new Error('keystore locked');
      },
    };
    const store = createSecureAuthStore(failing);

    expect((await store.getAuth()).ok).toBe(false);
    expect((await store.setAuth(AUTH)).ok).toBe(false);
    expect((await store.clearAuth()).ok).toBe(false);
  });
});
