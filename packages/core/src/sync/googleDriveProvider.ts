import type { Result } from '../result';
import { err, ok } from '../result';
import type { CloudAccount, CloudProvider, CloudToken, ConnectOptions, OAuthHttpClient } from './cloud';
import { createDriveRestClient, type DriveFetch } from './driveRestClient';
import { ensureFreshToken, signInWithDeviceFlow, type DeviceFlowConfig } from './googleDeviceFlow';
import { createGoogleDriveSyncStorage } from './googleDriveSyncStorage';
import type { SyncStorage } from './types';
import { utf8Decode } from './utf8';

const PROVIDER_ID = 'google-drive';
const USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const DEFAULT_APP_FOLDER_NAME = 'Taking Book';
const RECONNECT_MESSAGE = 'Google session expired; reconnect your account.';
const ALWAYS_REFRESH_SKEW_MS = Number.MAX_SAFE_INTEGER;

/** The sign-in as it is persisted: the token plus the account it belongs to. */
export interface StoredCloudAuth {
  token: CloudToken;
  account: CloudAccount;
}

/** Where a platform keeps the sign-in; implementations use that platform's protected storage. */
export interface CloudAuthStore {
  getAuth(): Promise<Result<StoredCloudAuth | null>>;
  setAuth(auth: StoredCloudAuth): Promise<Result<void>>;
  clearAuth(): Promise<Result<void>>;
}

/** Everything the device-flow Drive provider needs from the platform. */
export interface GoogleDriveDeviceFlowOptions {
  config: DeviceFlowConfig;
  /** Form posts to Google's OAuth endpoints. */
  http: OAuthHttpClient;
  /** Requests to the Drive and user-info endpoints. */
  fetchImpl: DriveFetch;
  authStore: CloudAuthStore;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  generateId: () => string;
  appFolderName?: string;
}

async function fetchAccount(fetchImpl: DriveFetch, accessToken: string): Promise<Result<CloudAccount>> {
  try {
    const response = await fetchImpl(USER_INFO_URL, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status === 401) return err(RECONNECT_MESSAGE);
    if (response.status < 200 || response.status >= 300) return err(`Google user info failed: HTTP ${response.status}`);
    const body = JSON.parse(utf8Decode(new Uint8Array(await response.arrayBuffer()))) as { email?: unknown; name?: unknown };
    return ok({
      providerId: PROVIDER_ID,
      displayName: typeof body.name === 'string' ? body.name : 'Google account',
      email: typeof body.email === 'string' ? body.email : '',
      // This provider signs in with the one configured client, so its token is never from an older one.
      needsReconnect: false,
    });
  } catch (error) {
    return err(`Google user info failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The Google Drive provider that signs in with the device flow (ADR-0010). The
 * code is shown through `connect`'s `onDeviceCode`; the token lives in the
 * injected auth store; sync goes through a Drive app folder.
 *
 * @param options The OAuth client config and the platform's HTTP, storage and clock.
 * @returns A cloud provider for the shared library UI.
 */
export function createGoogleDriveDeviceFlowProvider(options: GoogleDriveDeviceFlowOptions): CloudProvider {
  const { config, http, fetchImpl, authStore, now } = options;

  /** Returns a usable token, refreshing and saving it when needed; `always` forces a refresh. */
  async function freshAuth(always: boolean): Promise<Result<StoredCloudAuth>> {
    const stored = await authStore.getAuth();
    if (!stored.ok) return stored;
    if (!stored.data) return err('Connect Google Drive before syncing.');
    const token = await ensureFreshToken({
      http,
      config,
      token: stored.data.token,
      now,
      skewMilliseconds: always ? ALWAYS_REFRESH_SKEW_MS : undefined,
    });
    if (!token.ok) return err(token.error.includes('invalid_grant') ? RECONNECT_MESSAGE : token.error);
    if (token.data === stored.data.token) return ok(stored.data);
    const refreshed: StoredCloudAuth = { token: token.data, account: stored.data.account };
    const saved = await authStore.setAuth(refreshed);
    return saved.ok ? ok(refreshed) : saved;
  }

  async function connect(connectOptions?: ConnectOptions): Promise<Result<CloudAccount>> {
    const signedIn = await signInWithDeviceFlow({
      http,
      config,
      sleep: options.sleep,
      now,
      onDeviceCode: (prompt) => connectOptions?.onDeviceCode?.(prompt),
    });
    if (!signedIn.ok) return err(signedIn.error.message);
    const account = await fetchAccount(fetchImpl, signedIn.data.accessToken);
    if (!account.ok) return account;
    const saved = await authStore.setAuth({ token: signedIn.data, account: account.data });
    return saved.ok ? ok(account.data) : saved;
  }

  async function createSyncStorage(): Promise<Result<SyncStorage>> {
    const auth = await freshAuth(false);
    if (!auth.ok) return auth;
    const drive = createDriveRestClient({
      fetchImpl,
      generateId: options.generateId,
      getAccessToken: async (forceRefresh) => {
        const current = await freshAuth(forceRefresh);
        return current.ok ? ok(current.data.token.accessToken) : current;
      },
    });
    return ok(createGoogleDriveSyncStorage({ drive, appFolderName: options.appFolderName ?? DEFAULT_APP_FOLDER_NAME }));
  }

  return {
    providerId: PROVIDER_ID,
    providerName: 'Google Drive',
    async getAccount(): Promise<Result<CloudAccount | null>> {
      const stored = await authStore.getAuth();
      if (!stored.ok) return stored;
      return ok(stored.data ? stored.data.account : null);
    },
    connect,
    disconnect: () => authStore.clearAuth(),
    createSyncStorage,
  };
}
