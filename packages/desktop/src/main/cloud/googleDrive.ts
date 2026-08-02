import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  buildAuthorizationUrl,
  err,
  exchangeAuthorizationCode,
  isOk,
  ok,
  refreshAccessToken,
  type CloudAccount,
  type CloudProvider,
  type CloudToken,
  type OAuthHttpClient,
  type OAuthTokenResponse,
  type Result,
  type SyncStorage,
} from '@taking-book/core';
import type { CloudTokenStore } from './tokenStore';

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

interface DriveHttpResponse {
  status: number;
  body: string;
  bytes: Uint8Array | null;
}

interface DriveRestClient {
  ensureFolder(name: string, parentId: string | null): Promise<Result<string>>;
  findFile(folderId: string, name: string): Promise<Result<string | null>>;
  uploadFile(folderId: string, name: string, data: Uint8Array): Promise<Result<void>>;
  downloadFile(folderId: string, name: string): Promise<Result<Uint8Array | null>>;
  deleteFile(folderId: string, name: string): Promise<Result<void>>;
  listFiles(folderId: string): Promise<Result<string[]>>;
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

function toCloudToken(response: OAuthTokenResponse): CloudToken {
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: Date.now() + response.expiresInSeconds * 1000,
  };
}

/**
 * Google Drive provider. `connect()` runs the loopback OAuth flow (opens a
 * browser at Google's consent screen, catches the redirect on 127.0.0.1),
 * stores the token encrypted, and `createSyncStorage()` hands back a
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
      const drive = createDriveRestClient({
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
  const redirectUri = `http://127.0.0.1:${port}/`;
  const state = randomUUID();
  const authUrl = buildAuthorizationUrl({ ...deps.oauthConfig, redirectUri }, state, {
    access_type: 'offline',
    prompt: 'consent',
  });

  const codePromise = new Promise<Result<string>>((resolve) => {
    server.on('request', (req, res) => {
      res.setHeader('Content-Type', 'text/html');
      const url = new URL(req.url ?? '/', redirectUri);
      const returnedState = url.searchParams.get('state');
      const code = url.searchParams.get('code');
      res.end('<html><body><p>You can close this tab now.</p></body></html>');
      if (returnedState !== state) {
        resolve(err('OAuth state mismatch; try again.'));
        return;
      }
      if (!code) {
        resolve(err('Google did not return an authorization code.'));
        return;
      }
      resolve(ok(code));
    });
  });

  try {
    await deps.openExternal(authUrl);
  } catch (error) {
    stop();
    return err(`Could not open the browser for sign-in: ${errorMessage(error)}`);
  }

  const codeResult = await codePromise;
  stop();
  if (!isOk(codeResult)) return codeResult;

  const http = postFormHttpClient(deps.fetchImpl);
  const tokenResponse = await exchangeAuthorizationCode(http, { ...deps.oauthConfig, redirectUri }, codeResult.data);
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
  if (!isOk(response)) return err(`Could not refresh Google session: ${response.error}`);
  const refreshed = toCloudToken(response.data);
  const saved = await tokenStore.setAuth({ token: refreshed, account: stored.data.account });
  if (!isOk(saved)) return saved;
  return ok(refreshed);
}

/** Drive REST + upload client with automatic 401 token refresh. */
function createDriveRestClient(input: {
  fetchImpl: typeof fetch;
  tokenStore: CloudTokenStore;
  flowConfig: (redirectUri: string) => OAuthFlowConfig;
  driveApiBase: string;
  driveUploadBase: string;
}): DriveRestClient {
  const { fetchImpl, tokenStore, flowConfig, driveApiBase, driveUploadBase } = input;
  const http = postFormHttpClient(fetchImpl);

  const request = async (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    body?: string | Uint8Array,
    contentType?: string,
  ): Promise<Result<DriveHttpResponse>> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await freshToken(tokenStore, http, flowConfig(''));
      if (!isOk(token)) return token;
      if (!token.data) return err('Connect Google Drive before syncing.');
      try {
        const res = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token.data.accessToken}`,
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
          body: body as BodyInit | undefined,
        });
        const contentTypeHeader = res.headers.get('content-type') ?? '';
        const isJson = contentTypeHeader.includes('application/json');
        const raw = new Uint8Array(await res.arrayBuffer());
        const bodyText = isJson ? new TextDecoder().decode(raw) : '';
        const bytes = isJson ? null : raw;
        if (res.status === 401 && attempt === 0) {
          const refreshed = await refreshTokenFromStore();
          if (isOk(refreshed)) continue;
          return refreshed;
        }
        return ok({ status: res.status, body: bodyText, bytes });
      } catch (error) {
        return err(`Drive request failed: ${errorMessage(error)}`);
      }
    }
    return err('Drive request failed even after a token refresh.');
  };

  async function refreshTokenFromStore(): Promise<Result<CloudToken>> {
    const stored = await tokenStore.getAuth();
    if (!isOk(stored)) return stored;
    if (!stored.data?.token.refreshToken) return err('Google session expired; reconnect your account.');
    const response = await refreshAccessToken(http, flowConfig(''), stored.data.token.refreshToken);
    if (!isOk(response)) return err(`Could not refresh Google session: ${response.error}`);
    const refreshed = toCloudToken(response.data);
    const saved = await tokenStore.setAuth({ token: refreshed, account: stored.data.account });
    if (!isOk(saved)) return saved;
    return ok(refreshed);
  }

  async function apiJson(path: string): Promise<Result<unknown | null>> {
    const res = await request('GET', `${driveApiBase}${path}`);
    if (!isOk(res)) return res;
    if (res.data.status === 404) return ok(null);
    if (res.data.status < 200 || res.data.status >= 300) {
      return err(`Drive API HTTP ${res.data.status}: ${res.data.body}`);
    }
    try {
      return ok(JSON.parse(res.data.body) as unknown);
    } catch {
      return err('Drive API returned a malformed JSON body.');
    }
  }

  async function fileIdByName(folderId: string, name: string): Promise<Result<string | null>> {
    const q = encodeURIComponent(`name = '${name}' and '${folderId}' in parents and trashed = false`);
    const json = await apiJson(`/files?q=${q}&fields=files(id,name)&pageSize=1000`);
    if (!isOk(json)) return json;
    if (!json.data) return ok(null);
    const files = (json.data as { files?: { id: string }[] }).files ?? [];
    return ok(files[0]?.id ?? null);
  }

  return {
    async ensureFolder(name: string, parentId: string | null): Promise<Result<string>> {
      const parentQ = parentId ? `'${parentId}' in parents and ` : 'root in parents and ';
      const q = encodeURIComponent(
        `${parentQ}name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      );
      const existing = await apiJson(`/files?q=${q}&fields=files(id,name)`);
      if (!isOk(existing)) return existing;
      const found = (existing.data as { files?: { id: string }[] } | null)?.files?.[0]?.id;
      if (found) return ok(found);
      const created = await request(
        'POST',
        `${driveApiBase}/files`,
        JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parentId ? { parents: [parentId] } : {}),
        }),
        'application/json',
      );
      if (!isOk(created)) return created;
      if (created.data.status < 200 || created.data.status >= 300) {
        return err(`Drive create folder HTTP ${created.data.status}: ${created.data.body}`);
      }
      const parsed = JSON.parse(created.data.body) as { id: string };
      return ok(parsed.id);
    },

    async findFile(folderId: string, name: string): Promise<Result<string | null>> {
      return fileIdByName(folderId, name);
    },

    async uploadFile(folderId: string, name: string, data: Uint8Array): Promise<Result<void>> {
      const existing = await fileIdByName(folderId, name);
      if (!isOk(existing)) return existing;
      const boundary = `tb-${randomUUID()}`;
      const metadata = JSON.stringify({ name, parents: [folderId] });
      const encoder = new TextEncoder();
      const header = encoder.encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
      );
      const footer = encoder.encode(`\r\n--${boundary}--\r\n`);
      const body = new Uint8Array(header.length + data.length + footer.length);
      body.set(header, 0);
      body.set(data, header.length);
      body.set(footer, header.length + data.length);

      if (existing.data) {
        const res = await request(
          'PATCH',
          `${driveUploadBase}/files/${existing.data}?uploadType=media`,
          data,
          'application/octet-stream',
        );
        if (!isOk(res)) return res;
        if (res.data.status < 200 || res.data.status >= 300) {
          return err(`Drive update HTTP ${res.data.status}: ${res.data.body}`);
        }
        return ok(undefined);
      }
      const res = await request(
        'POST',
        `${driveUploadBase}/files?uploadType=multipart`,
        body,
        `multipart/related; boundary=${boundary}`,
      );
      if (!isOk(res)) return res;
      if (res.data.status < 200 || res.data.status >= 300) {
        return err(`Drive upload HTTP ${res.data.status}: ${res.data.body}`);
      }
      return ok(undefined);
    },

    async downloadFile(folderId: string, name: string): Promise<Result<Uint8Array | null>> {
      const fileId = await fileIdByName(folderId, name);
      if (!isOk(fileId)) return fileId;
      if (!fileId.data) return ok(null);
      const res = await request('GET', `${driveApiBase}/files/${fileId.data}?alt=media`);
      if (!isOk(res)) return res;
      if (res.data.status === 404) return ok(null);
      if (res.data.status < 200 || res.data.status >= 300) {
        return err(`Drive download HTTP ${res.data.status}: ${res.data.body}`);
      }
      return ok(res.data.bytes);
    },

    async deleteFile(folderId: string, name: string): Promise<Result<void>> {
      const fileId = await fileIdByName(folderId, name);
      if (!isOk(fileId)) return fileId;
      if (!fileId.data) return ok(undefined);
      const res = await request('DELETE', `${driveApiBase}/files/${fileId.data}`);
      if (!isOk(res)) return res;
      if (res.data.status < 200 || res.data.status >= 300) {
        return err(`Drive delete HTTP ${res.data.status}: ${res.data.body}`);
      }
      return ok(undefined);
    },

    async listFiles(folderId: string): Promise<Result<string[]>> {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      const json = await apiJson(`/files?q=${q}&fields=files(id,name)`);
      if (!isOk(json)) return json;
      const files = (json.data as { files?: { name: string }[] } | null)?.files ?? [];
      return ok(files.map((f) => f.name));
    },
  };
}

interface SyncStorageDeps {
  drive: DriveRestClient;
  appFolderName: string;
}

/** Maps `manifest.json` and `blobs/<hash>` keys onto a Drive app folder. */
export function createGoogleDriveSyncStorage(deps: SyncStorageDeps): SyncStorage {
  const { drive, appFolderName } = deps;
  let rootFolderId: string | null = null;
  let blobsFolderId: string | null = null;

  async function rootFolder(): Promise<Result<string>> {
    if (rootFolderId) return ok(rootFolderId);
    const id = await drive.ensureFolder(appFolderName, null);
    if (!isOk(id)) return id;
    rootFolderId = id.data;
    return ok(id.data);
  }

  async function blobsFolder(): Promise<Result<string>> {
    if (blobsFolderId) return ok(blobsFolderId);
    const root = await rootFolder();
    if (!isOk(root)) return root;
    const id = await drive.ensureFolder('blobs', root.data);
    if (!isOk(id)) return id;
    blobsFolderId = id.data;
    return ok(id.data);
  }

  function splitKey(key: string): { folder: () => Promise<Result<string>>; name: string } {
    if (key === 'manifest.json') return { folder: rootFolder, name: 'manifest.json' };
    const name = key.startsWith('blobs/') ? key.slice('blobs/'.length) : key;
    return { folder: blobsFolder, name };
  }

  return {
    async readFile(key: string): Promise<Result<Uint8Array | null>> {
      const { folder, name } = splitKey(key);
      const folderResult = await folder();
      if (!isOk(folderResult)) return folderResult;
      return drive.downloadFile(folderResult.data, name);
    },
    async writeFile(key: string, data: Uint8Array): Promise<Result<void>> {
      const { folder, name } = splitKey(key);
      const folderResult = await folder();
      if (!isOk(folderResult)) return folderResult;
      return drive.uploadFile(folderResult.data, name, data);
    },
    async deleteFile(key: string): Promise<Result<void>> {
      const { folder, name } = splitKey(key);
      const folderResult = await folder();
      if (!isOk(folderResult)) return folderResult;
      return drive.deleteFile(folderResult.data, name);
    },
    async listFiles(prefix: string): Promise<Result<string[]>> {
      const { folder, name } = splitKey(prefix);
      const folderResult = await folder();
      if (!isOk(folderResult)) return folderResult;
      const names = await drive.listFiles(folderResult.data);
      if (!isOk(names)) return names;
      if (name && name !== 'blobs') return ok(names.data.filter((n) => n.startsWith(name)));
      return ok(names.data.map((n) => (prefix === 'blobs/' ? `blobs/${n}` : n)));
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
