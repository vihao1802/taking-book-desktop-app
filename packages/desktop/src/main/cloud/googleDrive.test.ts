import { describe, expect, it } from 'vitest';
import { isOk, ok, type CloudAccount, type CloudToken } from '@taking-book/core';
import { createGoogleDriveProvider, type GoogleDriveDeps } from './googleDrive';
import type { CloudTokenStore, StoredCloudAuth } from './tokenStore';

function createMockTokenStore(initialAuth: StoredCloudAuth | null = null): {
  store: CloudTokenStore;
  getStored: () => StoredCloudAuth | null;
} {
  let current = initialAuth;
  return {
    store: {
      async getAuth() {
        return ok(current);
      },
      async setAuth(auth: StoredCloudAuth) {
        current = auth;
        return ok(undefined);
      },
      async clearAuth() {
        current = null;
        return ok(undefined);
      },
    },
    getStored: () => current,
  };
}

const mockAccount: CloudAccount = {
  providerId: 'google-drive',
  displayName: 'Test User',
  email: 'test@example.com',
};

describe('createGoogleDriveProvider', () => {
  it('returns null account when token store is empty', async () => {
    const { store } = createMockTokenStore(null);
    const provider = createGoogleDriveProvider({
      clientId: 'test-client-id',
      tokenStore: store,
      openExternal: () => undefined,
    });

    const account = await provider.getAccount();
    expect(isOk(account)).toBe(true);
    if (isOk(account)) {
      expect(account.data).toBeNull();
    }
  });

  it('returns account from token store when connected', async () => {
    const { store } = createMockTokenStore({
      token: {
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiresAt: Date.now() + 3600_000,
      },
      account: mockAccount,
    });
    const provider = createGoogleDriveProvider({
      clientId: 'test-client-id',
      tokenStore: store,
      openExternal: () => undefined,
    });

    const account = await provider.getAccount();
    expect(isOk(account)).toBe(true);
    if (isOk(account)) {
      expect(account.data).toEqual(mockAccount);
    }
  });

  it('disconnects by clearing token store', async () => {
    const { store, getStored } = createMockTokenStore({
      token: {
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiresAt: Date.now() + 3600_000,
      },
      account: mockAccount,
    });
    const provider = createGoogleDriveProvider({
      clientId: 'test-client-id',
      tokenStore: store,
      openExternal: () => undefined,
    });

    const result = await provider.disconnect();
    expect(isOk(result)).toBe(true);
    expect(getStored()).toBeNull();
  });

  it('preserves existing refresh token when Google refresh response omits refresh_token', async () => {
    const initialToken: CloudToken = {
      accessToken: 'old-access-token',
      refreshToken: 'persistent-refresh-token',
      expiresAt: Date.now() - 10_000, // expired
    };
    const { store, getStored } = createMockTokenStore({
      token: initialToken,
      account: mockAccount,
    });

    // Mock fetch for token refresh (Google returns new access_token without refresh_token)
    const mockFetch: typeof fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            access_token: 'new-access-token',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const deps: GoogleDriveDeps = {
      clientId: 'test-client-id',
      tokenStore: store,
      openExternal: () => undefined,
      fetchImpl: mockFetch,
    };

    const provider = createGoogleDriveProvider(deps);
    const storageResult = await provider.createSyncStorage();
    expect(isOk(storageResult)).toBe(true);

    const updated = getStored();
    expect(updated).not.toBeNull();
    expect(updated?.token.accessToken).toBe('new-access-token');
    // Crucial: refreshToken must NOT have been wiped to null!
    expect(updated?.token.refreshToken).toBe('persistent-refresh-token');
  });

  it('returns clear session expired error when refresh token is missing', async () => {
    const initialToken: CloudToken = {
      accessToken: 'old-access-token',
      refreshToken: null,
      expiresAt: Date.now() - 10_000,
    };
    const { store } = createMockTokenStore({
      token: initialToken,
      account: mockAccount,
    });

    const provider = createGoogleDriveProvider({
      clientId: 'test-client-id',
      tokenStore: store,
      openExternal: () => undefined,
    });

    const storageResult = await provider.createSyncStorage();
    expect(isOk(storageResult)).toBe(false);
    if (!isOk(storageResult)) {
      expect(storageResult.error).toBe('Google session expired; reconnect your account.');
    }
  });

  it('handles invalid_grant error gracefully as session expired', async () => {
    const initialToken: CloudToken = {
      accessToken: 'old-access-token',
      refreshToken: 'revoked-refresh-token',
      expiresAt: Date.now() - 10_000,
    };
    const { store } = createMockTokenStore({
      token: initialToken,
      account: mockAccount,
    });

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr === 'https://oauth2.googleapis.com/token') {
        return new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const provider = createGoogleDriveProvider({
      clientId: 'test-client-id',
      tokenStore: store,
      openExternal: () => undefined,
      fetchImpl: mockFetch,
    });

    const storageResult = await provider.createSyncStorage();
    expect(isOk(storageResult)).toBe(false);
    if (!isOk(storageResult)) {
      expect(storageResult.error).toBe('Google session expired; reconnect your account.');
    }
  });

  it('queries root folder using valid Drive API syntax when accessing sync storage', async () => {
    const { store } = createMockTokenStore({
      token: {
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() + 3600_000,
      },
      account: mockAccount,
    });

    const requestedUrls: string[] = [];
    const mockFetch: typeof fetch = async (url) => {
      const urlStr = String(url);
      requestedUrls.push(urlStr);

      const parsedUrl = new URL(urlStr);
      const q = parsedUrl.searchParams.get('q');
      if (q) {
        // Drive API rejects unquoted root in parents queries with HTTP 400 Invalid Value
        if (q.includes('root in parents')) {
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: 'Invalid Value',
                errors: [
                  {
                    message: 'Invalid Value',
                    domain: 'global',
                    reason: 'invalid',
                    location: 'q',
                    locationType: 'parameter',
                  },
                ],
              },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }

      if (urlStr.includes('/files?q=')) {
        return new Response(JSON.stringify({ files: [{ id: 'folder-root-id', name: 'Taking Book' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/files/folder-root-id?alt=media')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const provider = createGoogleDriveProvider({
      clientId: 'test-client-id',
      tokenStore: store,
      openExternal: () => undefined,
      fetchImpl: mockFetch,
    });

    const storageResult = await provider.createSyncStorage();
    expect(isOk(storageResult)).toBe(true);
    if (isOk(storageResult)) {
      const manifestResult = await storageResult.data.readFile('manifest.json');
      expect(manifestResult).toEqual(ok(new Uint8Array([1, 2, 3])));
    }
  });

  it('escapes single quotes and special characters in folder and file queries', async () => {
    const { store } = createMockTokenStore({
      token: {
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() + 3600_000,
      },
      account: mockAccount,
    });

    const queries: string[] = [];
    const mockFetch: typeof fetch = async (url) => {
      const urlStr = String(url);
      const parsedUrl = new URL(urlStr);
      const q = parsedUrl.searchParams.get('q');
      if (q) queries.push(q);

      if (urlStr.includes('/files?q=')) {
        return new Response(JSON.stringify({ files: [{ id: 'app-folder-id', name: "O'Reilly Books" }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (urlStr.includes('/files/app-folder-id?alt=media')) {
        return new Response(new Uint8Array([4, 5, 6]), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      }

      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const provider = createGoogleDriveProvider({
      clientId: 'test-client-id',
      appFolderName: "O'Reilly Books",
      tokenStore: store,
      openExternal: () => undefined,
      fetchImpl: mockFetch,
    });

    const storageResult = await provider.createSyncStorage();
    expect(isOk(storageResult)).toBe(true);
    if (isOk(storageResult)) {
      await storageResult.data.readFile('manifest.json');
      expect(queries.some((q) => q.includes("'root' in parents and name = 'O\\'Reilly Books'"))).toBe(true);
    }
  });
});
