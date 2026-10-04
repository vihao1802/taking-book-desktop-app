import { randomUUID } from 'node:crypto';
import {
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

/** Drive REST + upload client with automatic 401 token refresh. */
function createDriveRestClient(input: {
  fetchImpl: typeof fetch;
  tokenStore: CloudTokenStore;
  flowConfig: () => OAuthClientConfig;
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
      const token = await freshToken(tokenStore, http, flowConfig());
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

  function escapeDriveQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async function fileIdByName(folderId: string, name: string): Promise<Result<string | null>> {
    const q = encodeURIComponent(
      `name = '${escapeDriveQueryValue(name)}' and '${folderId}' in parents and trashed = false`,
    );
    const json = await apiJson(`/files?q=${q}&fields=files(id,name)&pageSize=1000`);
    if (!isOk(json)) return json;
    if (!json.data) return ok(null);
    const files = (json.data as { files?: { id: string }[] }).files ?? [];
    return ok(files[0]?.id ?? null);
  }

  return {
    async ensureFolder(name: string, parentId: string | null): Promise<Result<string>> {
      const parentQ = parentId ? `'${parentId}' in parents and ` : "'root' in parents and ";
      const q = encodeURIComponent(
        `${parentQ}name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
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
