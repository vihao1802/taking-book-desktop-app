import { createServer, type Server } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  buildAuthorizationUrl,
  createDriveRestClient,
  createGoogleDriveSyncStorage,
  deriveCodeChallenge,
  err,
  exchangeAuthorizationCode,
  generateCodeVerifier,
  isOk,
  ok,
  refreshAccessToken,
  type CloudAccount,
  type CloudProvider,
  type CloudToken,
  type DriveRestClient,
  type OAuthHttpClient,
  type OAuthTokenResponse,
  type Result,
  type SyncStorage,
} from '@taking-book/core';
import type { CloudTokenStore } from './tokenStore';
import { renderOAuthResultPage } from './oauthLandingPage';

const DEFAULT_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USER_INFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const REFRESH_SKEW_MS = 60_000;
const OAuth_TIMEOUT_MS = 5 * 60_000;

export interface GoogleDriveDeps {
  clientId: string;
  clientSecret?: string;
  tokenStore: CloudTokenStore;
  openExternal: (url: string) => Promise<void> | void;
  fetchImpl?: typeof fetch;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  driveApiBase?: string;
  driveUploadBase?: string;
  scopes?: string[];
  appFolderName?: string;
}

interface OAuthFlowConfig {
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
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
 * Google Drive provider. `connect()` runs the loopback OAuth flow (opens a
 * browser at Google's consent screen, catches the redirect on a loopback
 * address), stores the token encrypted, and `createSyncStorage()` hands back a
 * {@link SyncStorage} over the Drive REST API.
 */
export function createGoogleDriveProvider(deps: GoogleDriveDeps): CloudProvider {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const authorizationUrl = deps.authorizationUrl ?? AUTH_URL;
  const tokenUrl = deps.tokenUrl ?? TOKEN_URL;
  const userInfoUrl = deps.userInfoUrl ?? USER_INFO_URL;
  const driveApiBase = deps.driveApiBase ?? DRIVE_API_BASE;
  const driveUploadBase = deps.driveUploadBase ?? DRIVE_UPLOAD_BASE;
  const scopes = deps.scopes ?? DEFAULT_SCOPES;
  const appFolderName = deps.appFolderName ?? 'Taking Book';

  function flowConfig(redirectUri: string): OAuthFlowConfig {
    return {
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      authorizationUrl,
      tokenUrl,
      redirectUri,
      scopes,
    };
  }

  async function accountFromToken(token: CloudToken): Promise<Result<CloudAccount>> {
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
      return ok(stored.data.account);
    },

    async connect(): Promise<Result<CloudAccount>> {
      const result = await runLoopbackOAuth({
        oauthConfig: flowConfig(''),
        tokenStore: deps.tokenStore,
        fetchImpl,
        openExternal: deps.openExternal,
        accountFromToken,
      });
      if (!isOk(result)) return result;
      return ok(result.data.account);
    },

    async disconnect(): Promise<Result<void>> {
      return deps.tokenStore.clearAuth();
    },

    async createSyncStorage(): Promise<Result<SyncStorage>> {
      const tokenResult = await freshToken(
        deps.tokenStore,
        postFormHttpClient(fetchImpl),
        flowConfig(''),
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

interface LoopbackDeps {
  oauthConfig: OAuthFlowConfig;
  tokenStore: CloudTokenStore;
  fetchImpl: typeof fetch;
  openExternal: (url: string) => Promise<void> | void;
  accountFromToken: (token: CloudToken) => Promise<Result<CloudAccount>>;
}

/** Opens the consent URL, waits for the loopback redirect, exchanges the code. */
async function runLoopbackOAuth(deps: LoopbackDeps): Promise<Result<{ account: CloudAccount }>> {
  const { server, port, stop } = await listenLoopback();
  if (!server) return loopbackFailure('Could not start the local auth server. Try again.');
  if (!port) return loopbackFailure('Could not resolve a local auth port. Try again.');
  const redirectUri = `http://127.0.0.1:${port}`;
  const state = randomUUID();
  // PKCE: the verifier lives only in this closure — generated before the
  // browser opens and handed to the token exchange, never persisted. The
  // challenge is derived via S256 and sent with the authorization request.
  const codeVerifier = generateCodeVerifier((size) => new Uint8Array(randomBytes(size)));
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const authUrl = buildAuthorizationUrl({ ...deps.oauthConfig, redirectUri }, state, {
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const codePromise = new Promise<Result<string>>((resolve) => {
    server.on('request', (req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const url = new URL(req.url ?? '/', redirectUri);
      const returnedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      let outcome: Result<string>;
      if (returnedState !== state) {
        outcome = err('OAuth state mismatch; try again.');
      } else if (!code) {
        outcome = err('Google did not return an authorization code.');
      } else {
        outcome = ok(code);
      }
      res.end(
        renderOAuthResultPage(
          isOk(outcome)
            ? { state: 'success' }
            : { state: 'error', message: outcome.error },
        ),
      );
      resolve(outcome);
    });
  });

  // If the user closes the browser or the consent screen is never completed,
  // bail out after OAuth_TIMEOUT_MS so the Connect flow returns instead of
  // hanging and leaving the loopback server running. The caller surfaces the
  // error and the user can simply click Connect again.
  const timedOut = withTimeout(
    codePromise,
    OAuth_TIMEOUT_MS,
    err('Sign-in timed out; click Connect to try again.'),
  );

  try {
    await deps.openExternal(authUrl);
  } catch (error) {
    stop();
    return err(`Could not open the browser for sign-in: ${errorMessage(error)}`);
  }

  const codeResult = await timedOut;
  stop();
  if (!isOk(codeResult)) return codeResult;

  const http = postFormHttpClient(deps.fetchImpl);
  const tokenResponse = await exchangeAuthorizationCode(
    http,
    { ...deps.oauthConfig, redirectUri },
    codeResult.data,
    codeVerifier,
  );
  if (!isOk(tokenResponse)) return tokenResponse;
  const token = toCloudToken(tokenResponse.data);
  const accountResult = await deps.accountFromToken(token);
  if (!isOk(accountResult)) return accountResult;
  const saved = await deps.tokenStore.setAuth({ token, account: accountResult.data });
  if (!isOk(saved)) return saved;
  return ok({ account: accountResult.data });
}

interface LoopbackListenResult {
  server: Server | null;
  port: number;
  stop: () => void;
}

/** Error returned when the loopback server could not be started. */
function loopbackFailure(message: string): Result<{ account: CloudAccount }> {
  return err(message);
}

function listenLoopback(): Promise<LoopbackListenResult> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve({ server: null, port: 0, stop: () => undefined }));
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        resolve({ server: null, port: 0, stop: () => undefined });
        return;
      }
      resolve({ server, port: address.port, stop: () => server.close() });
    });
  });
}

/** Returns a fresh token, refreshing from the stored refresh token when needed. */
async function freshToken(
  tokenStore: CloudTokenStore,
  http: OAuthHttpClient,
  oauthConfig: OAuthFlowConfig,
): Promise<Result<CloudToken | null>> {
  const stored = await tokenStore.getAuth();
  if (!isOk(stored)) return stored;
  if (!stored.data) return ok(null);
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
  const saved = await tokenStore.setAuth({ token: refreshed, account: stored.data.account });
  if (!isOk(saved)) return saved;
  return ok(refreshed);
}

/** Drive REST client over the shared core implementation, with the desktop's stored token. */
function createDesktopDriveClient(input: {
  fetchImpl: typeof fetch;
  tokenStore: CloudTokenStore;
  flowConfig: (redirectUri: string) => OAuthFlowConfig;
  driveApiBase: string;
  driveUploadBase: string;
}): DriveRestClient {
  const { fetchImpl, tokenStore, flowConfig } = input;
  const http = postFormHttpClient(fetchImpl);

  async function refreshStoredToken(): Promise<Result<CloudToken>> {
    const stored = await tokenStore.getAuth();
    if (!isOk(stored)) return stored;
    if (!stored.data?.token.refreshToken) return err('Google session expired; reconnect your account.');
    const response = await refreshAccessToken(http, flowConfig(''), stored.data.token.refreshToken);
    if (!isOk(response)) {
      if (response.error.includes('invalid_grant')) {
        return err('Google session expired; reconnect your account.');
      }
      return err(`Could not refresh Google session: ${response.error}`);
    }
    const refreshed = toCloudToken(response.data, stored.data.token.refreshToken);
    const saved = await tokenStore.setAuth({ token: refreshed, account: stored.data.account });
    if (!isOk(saved)) return saved;
    return ok(refreshed);
  }

  return createDriveRestClient({
    fetchImpl: (url, init) => fetchImpl(url, { method: init.method, headers: init.headers, body: init.body as BodyInit | undefined }),
    generateId: randomUUID,
    driveApiBase: input.driveApiBase,
    driveUploadBase: input.driveUploadBase,
    getAccessToken: async (forceRefresh) => {
      const token = forceRefresh ? await refreshStoredToken() : await freshToken(tokenStore, http, flowConfig(''));
      if (!isOk(token)) return token;
      if (!token.data) return err('Connect Google Drive before syncing.');
      return ok(token.data.accessToken);
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Resolves with the promise's value, or the fallback after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
