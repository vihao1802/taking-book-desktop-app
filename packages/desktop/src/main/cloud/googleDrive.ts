import { randomUUID } from 'node:crypto';
import {
  createDriveRestClient,
  createGoogleDriveSyncStorage,
  err,
  GOOGLE_DEVICE_CODE_URL,
  GOOGLE_DEVICE_FLOW_SCOPES,
  GOOGLE_TOKEN_URL,
  isOk,
  ok,
  refreshAccessToken,
  signInWithDeviceFlow,
  type CloudAccount,
  type CloudProvider,
  type CloudToken,
  type ConnectOptions,
  type DeviceCodePrompt,
  type DeviceFlowConfig,
  type DriveRestClient,
  type OAuthClientConfig,
  type OAuthHttpClient,
  type OAuthTokenResponse,
  type Result,
  type SyncStorage,
} from '@taking-book/core';
import type { CloudTokenStore } from './tokenStore';

const TOKEN_URL = GOOGLE_TOKEN_URL;
const USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const REFRESH_SKEW_MS = 60_000;
const RECONNECT_REQUIRED_MESSAGE =
  'Reconnect Google Drive once: this sign-in was made by an earlier version of Taking Book.';

export interface GoogleDriveDeps {
  clientId: string;
  clientSecret?: string;
  tokenStore: CloudTokenStore;
  openExternal: (url: string) => Promise<void> | void;
  /** Puts the device code on the clipboard so the reader can paste it on the verification page. */
  copyToClipboard: (text: string) => void;
  fetchImpl?: typeof fetch;
  deviceCodeUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  driveApiBase?: string;
  driveUploadBase?: string;
  scopes?: string[];
  appFolderName?: string;
}

function postFormHttpClient(fetchImpl: typeof fetch): OAuthHttpClient {
  return {
    async postForm(url: string, params: Record<string, string>): Promise<Result<{ status: number; body: string }>> {
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(params).toString(),
        });
        return ok({ status: res.status, body: await res.text() });
      } catch (error) {
        return err(`OAuth request failed: ${errorMessage(error)}`);
      }
    },
  };
}

function toCloudToken(response: OAuthTokenResponse, existingRefreshToken?: string | null): CloudToken {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken ?? existingRefreshToken ?? null,
    expiresAt: Date.now() + response.expiresInSeconds * 1000,
  };
}

/**
 * Google Drive provider. `connect()` runs the OAuth device flow (ADR-0010):
 * it shows and copies a code, opens the verification page, waits for the
 * reader to approve, stores the token encrypted, and `createSyncStorage()` hands back a
 * {@link SyncStorage} over the Drive REST API.
 */
export function createGoogleDriveProvider(deps: GoogleDriveDeps): CloudProvider {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const deviceCodeUrl = deps.deviceCodeUrl ?? GOOGLE_DEVICE_CODE_URL;
  const tokenUrl = deps.tokenUrl ?? TOKEN_URL;
  const userInfoUrl = deps.userInfoUrl ?? USER_INFO_URL;
  const driveApiBase = deps.driveApiBase ?? DRIVE_API_BASE;
  const driveUploadBase = deps.driveUploadBase ?? DRIVE_UPLOAD_BASE;
  const scopes = deps.scopes ?? [...GOOGLE_DEVICE_FLOW_SCOPES];
  const appFolderName = deps.appFolderName ?? 'Taking Book';

  function flowConfig(): OAuthClientConfig {
    // The refresh helper reads only the client and token endpoint; the sign-in
    // redirect fields have no meaning in the device flow.
    return {
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      authorizationUrl: '',
      tokenUrl,
      redirectUri: '',
      scopes,
    };
  }

  function deviceFlowConfig(): DeviceFlowConfig {
    return {
      clientId: deps.clientId,
      clientSecret: deps.clientSecret ?? '',
      deviceCodeUrl,
      tokenUrl,
      scopes,
    };
  }

  /** Copies the code and opens the verification page, then lets the UI show them too. */
  function presentDeviceCode(prompt: DeviceCodePrompt, options: ConnectOptions): void {
    deps.copyToClipboard(prompt.userCode);
    void Promise.resolve(deps.openExternal(prompt.verificationUrl)).catch((error: unknown) => {
      console.error(`[cloud] could not open the verification page: ${errorMessage(error)}`);
    });
    options.onDeviceCode?.(prompt);
  }

  async function accountFromToken(token: CloudToken): Promise<Result<Omit<CloudAccount, 'needsReconnect'>>> {
    try {
      const res = await fetchImpl(userInfoUrl, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      if (res.status === 401) return err('Google session expired; reconnect your account');
      if (!res.ok) return err(`Google user info failed: HTTP ${res.status}`);
      const body = (await res.json()) as { email?: unknown; name?: unknown };
      return ok({
        providerId: 'google-drive',
        displayName: typeof body.name === 'string' ? body.name : 'Google account',
        email: typeof body.email === 'string' ? body.email : '',
      });
    } catch (error) {
      return err(`Google user info failed: ${errorMessage(error)}`);
    }
  }

  return {
    providerId: 'google-drive',
    providerName: 'Google Drive',

    async getAccount(): Promise<Result<CloudAccount | null>> {
      const stored = await deps.tokenStore.getAuth();
      if (!isOk(stored)) return stored;
      if (!stored.data) return ok(null);
      const needsReconnect = stored.data.clientId !== deps.clientId;
      return ok({ ...stored.data.account, needsReconnect });
    },

    async connect(options: ConnectOptions = {}): Promise<Result<CloudAccount>> {
      const signedIn = await signInWithDeviceFlow({
        http: postFormHttpClient(fetchImpl),
        config: deviceFlowConfig(),
        sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        now: () => Date.now(),
        onDeviceCode: (prompt) => presentDeviceCode(prompt, options),
      });
      if (!signedIn.ok) return err(signedIn.error.message);
      const account = await accountFromToken(signedIn.data);
      if (!isOk(account)) return account;
      const saved = await deps.tokenStore.setAuth({
        token: signedIn.data,
        account: account.data,
        clientId: deps.clientId,
      });
      if (!isOk(saved)) return saved;
      return ok({ ...account.data, needsReconnect: false });
    },

    async disconnect(): Promise<Result<void>> {
      return deps.tokenStore.clearAuth();
    },

    async createSyncStorage(): Promise<Result<SyncStorage>> {
      const tokenResult = await freshToken(
        deps.tokenStore,
        postFormHttpClient(fetchImpl),
        flowConfig(),
      );
      if (!isOk(tokenResult)) return tokenResult;
      if (!tokenResult.data) return err('Connect Google Drive before syncing.');
      const drive = createDesktopDriveClient({
        fetchImpl,
        tokenStore: deps.tokenStore,
        flowConfig,
        driveApiBase,
        driveUploadBase,
      });
      return ok(createGoogleDriveSyncStorage({ drive, appFolderName }));
    },
  };
}

/** Returns a fresh token, refreshing from the stored refresh token when needed. */
async function freshToken(
  tokenStore: CloudTokenStore,
  http: OAuthHttpClient,
  oauthConfig: OAuthClientConfig,
): Promise<Result<CloudToken | null>> {
  const stored = await tokenStore.getAuth();
  if (!isOk(stored)) return stored;
  if (!stored.data) return ok(null);
  if (stored.data.clientId !== oauthConfig.clientId) return err(RECONNECT_REQUIRED_MESSAGE);
  const { token } = stored.data;
  if (token.expiresAt - REFRESH_SKEW_MS > Date.now()) return ok(token);
  if (!token.refreshToken) return err('Google session expired; reconnect your account.');
  const response = await refreshAccessToken(http, oauthConfig, token.refreshToken);
  if (!isOk(response)) {
    if (response.error.includes('invalid_grant')) {
      return err('Google session expired; reconnect your account.');
    }
    return err(`Could not refresh Google session: ${response.error}`);
  }
  const refreshed = toCloudToken(response.data, token.refreshToken);
  const saved = await tokenStore.setAuth({ ...stored.data, token: refreshed });
  if (!isOk(saved)) return saved;
  return ok(refreshed);
}

/** Drive REST client over the shared core implementation, with the desktop's stored token. */
function createDesktopDriveClient(input: {
  fetchImpl: typeof fetch;
  tokenStore: CloudTokenStore;
  flowConfig: () => OAuthClientConfig;
  driveApiBase: string;
  driveUploadBase: string;
}): DriveRestClient {
  const { fetchImpl, tokenStore, flowConfig } = input;
  const http = postFormHttpClient(fetchImpl);

  async function refreshStoredToken(): Promise<Result<CloudToken>> {
    const stored = await tokenStore.getAuth();
    if (!isOk(stored)) return stored;
    if (!stored.data?.token.refreshToken) return err('Google session expired; reconnect your account.');
    const response = await refreshAccessToken(http, flowConfig(), stored.data.token.refreshToken);
    if (!isOk(response)) {
      if (response.error.includes('invalid_grant')) {
        return err('Google session expired; reconnect your account.');
      }
      return err(`Could not refresh Google session: ${response.error}`);
    }
    const refreshed = toCloudToken(response.data, stored.data.token.refreshToken);
    const saved = await tokenStore.setAuth({ ...stored.data, token: refreshed });
    if (!isOk(saved)) return saved;
    return ok(refreshed);
  }

  return createDriveRestClient({
    fetchImpl: (url, init) => fetchImpl(url, { method: init.method, headers: init.headers, body: init.body as BodyInit | undefined }),
    generateId: randomUUID,
    driveApiBase: input.driveApiBase,
    driveUploadBase: input.driveUploadBase,
    getAccessToken: async (forceRefresh) => {
      const token = forceRefresh ? await refreshStoredToken() : await freshToken(tokenStore, http, flowConfig());
      if (!isOk(token)) return token;
      if (!token.data) return err('Connect Google Drive before syncing.');
      return ok(token.data.accessToken);
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
