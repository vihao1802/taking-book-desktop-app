import { err, ok, type Result } from '../src/result';
import type { CloudProvider, CloudToken, OAuthHttpClient } from '../src/sync/cloud';
import type { DriveFetch, DriveFetchInit, DriveFetchResponse } from '../src/sync/driveRestClient';
import { GOOGLE_DEVICE_CODE_URL, GOOGLE_DEVICE_FLOW_SCOPES, GOOGLE_TOKEN_URL } from '../src/sync/googleDeviceFlow';
import {
  createGoogleDriveDeviceFlowProvider,
  type CloudAuthStore,
  type StoredCloudAuth,
} from '../src/sync/googleDriveProvider';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const NOW = 1_000_000;

interface FakeEntry {
  id: string;
  name: string;
  parent: string;
  mimeType: string;
  data: Uint8Array;
}

/** An in-memory stand-in for the parts of Drive the app folder uses. */
export interface FakeDriveServer {
  fetchImpl: DriveFetch;
  /** The names of the stored non-folder files, in creation order. */
  fileNames(): string[];
  /** Each distinct access token the Drive endpoints saw, in order of first use. */
  seenTokens(): string[];
}

function jsonResponse(status: number, body: unknown): DriveFetchResponse {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

function bytesResponse(status: number, bytes: Uint8Array): DriveFetchResponse {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/octet-stream' : null) },
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

function latin1(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

function fromLatin1(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

/** Splits a multipart/related body into its JSON metadata and its file bytes. */
function parseMultipart(body: Uint8Array): { metadata: { name: string; parents: string[] }; data: Uint8Array } {
  const text = latin1(body);
  const firstBreak = text.indexOf('\r\n\r\n');
  const secondBreak = text.indexOf('\r\n\r\n', firstBreak + 4);
  const metadataEnd = text.indexOf('\r\n--', firstBreak + 4);
  const dataEnd = text.lastIndexOf('\r\n--');
  return {
    metadata: JSON.parse(text.slice(firstBreak + 4, metadataEnd)) as { name: string; parents: string[] },
    data: fromLatin1(text.slice(secondBreak + 4, dataEnd)),
  };
}

function matchesQuery(entry: FakeEntry, query: string): boolean {
  const name = /name = '((?:[^'\\]|\\.)*)'/.exec(query)?.[1];
  const parent = /'([^']+)' in parents/.exec(query)?.[1];
  if (name !== undefined && entry.name !== name) return false;
  if (parent !== undefined && entry.parent !== parent) return false;
  if (query.includes('mimeType') && entry.mimeType !== FOLDER_MIME) return false;
  return true;
}

export function createFakeDriveServer(options: { rejectToken?: string } = {}): FakeDriveServer {
  const entries: FakeEntry[] = [];
  const tokens: string[] = [];
  let nextId = 1;

  function add(name: string, parent: string, mimeType: string, data: Uint8Array): FakeEntry {
    const entry = { id: `id-${nextId++}`, name, parent, mimeType, data };
    entries.push(entry);
    return entry;
  }

  function handle(url: string, init: DriveFetchInit): DriveFetchResponse {
    const parsed = new URL(url);
    const id = /\/files\/([^/?]+)/.exec(parsed.pathname)?.[1];
    const target = entries.find((entry) => entry.id === id);
    if (init.method === 'GET' && !id) {
      const query = parsed.searchParams.get('q') ?? '';
      return jsonResponse(200, { files: entries.filter((entry) => matchesQuery(entry, query)).map(({ id: fileId, name, data }) => ({ id: fileId, name, size: String(data.length) })) });
    }
    if (init.method === 'GET') return target ? bytesResponse(200, target.data) : jsonResponse(404, {});
    if (init.method === 'DELETE') {
      if (target) entries.splice(entries.indexOf(target), 1);
      return bytesResponse(204, new Uint8Array());
    }
    if (init.method === 'PATCH' && target && init.body instanceof Uint8Array) {
      target.data = init.body;
      return jsonResponse(200, { id: target.id });
    }
    if (parsed.pathname.includes('/upload/') && init.body instanceof Uint8Array) {
      const { metadata, data } = parseMultipart(init.body);
      return jsonResponse(200, { id: add(metadata.name, metadata.parents[0] ?? 'root', 'application/octet-stream', data).id });
    }
    const folder = JSON.parse(String(init.body)) as { name: string; parents?: string[] };
    return jsonResponse(200, { id: add(folder.name, folder.parents?.[0] ?? 'root', FOLDER_MIME, new Uint8Array()).id });
  }

  const fetchImpl: DriveFetch = (url, init) => {
    const token = /^Bearer (.+)$/.exec(init.headers.Authorization ?? '')?.[1] ?? '';
    if (!tokens.includes(token)) tokens.push(token);
    if (token === options.rejectToken) return Promise.resolve(jsonResponse(401, {}));
    return Promise.resolve(handle(url, init));
  };

  return {
    fetchImpl,
    fileNames: () => entries.filter((entry) => entry.mimeType !== FOLDER_MIME).map((entry) => entry.name),
    seenTokens: () => [...tokens],
  };
}

type Reply = { status: number; body: unknown };

export interface GoogleDeviceFlowFixtureOptions {
  /** Replies the token endpoint gives to device-code polls, before it approves. */
  tokenReplies?: Reply[];
  storedToken?: CloudToken;
  rejectToken?: string;
  refreshFails?: boolean;
}

export interface GoogleDeviceFlowFixture {
  provider: CloudProvider;
  drive: FakeDriveServer;
  authStore: CloudAuthStore & { current(): StoredCloudAuth | null };
}

function createMemoryAuthStore(initial: StoredCloudAuth | null): GoogleDeviceFlowFixture['authStore'] {
  let stored = initial;
  return {
    current: () => stored,
    getAuth: () => Promise.resolve(ok(stored)),
    setAuth: (auth) => {
      stored = auth;
      return Promise.resolve(ok(undefined));
    },
    clearAuth: () => {
      stored = null;
      return Promise.resolve(ok(undefined));
    },
  };
}

function createOAuthHttp(options: GoogleDeviceFlowFixtureOptions): OAuthHttpClient {
  const replies = [...(options.tokenReplies ?? [])];
  return {
    postForm(url, params): Promise<Result<{ status: number; body: string }>> {
      const reply = (status: number, body: unknown): Promise<Result<{ status: number; body: string }>> =>
        Promise.resolve(ok({ status, body: JSON.stringify(body) }));
      if (url === GOOGLE_DEVICE_CODE_URL) {
        return reply(200, {
          device_code: 'device',
          user_code: 'ABCD-EFGH',
          verification_url: 'https://google.com/device',
          expires_in: 1800,
          interval: 5,
        });
      }
      if (url !== GOOGLE_TOKEN_URL) return Promise.resolve(err(`unexpected url ${url}`));
      if (params.grant_type === 'refresh_token') {
        return options.refreshFails
          ? reply(400, { error: 'invalid_grant' })
          : reply(200, { access_token: 'refreshed-token', expires_in: 3600 });
      }
      const next = replies.shift();
      return next ? reply(next.status, next.body) : reply(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 });
    },
  };
}

/** Builds the device-flow Drive provider over a fake OAuth server, fake Drive and in-memory auth store. */
export function createGoogleDeviceFlowProviderForTest(options: GoogleDeviceFlowFixtureOptions = {}): GoogleDeviceFlowFixture {
  const drive = createFakeDriveServer({ rejectToken: options.rejectToken });
  const account = { providerId: 'google-drive', displayName: 'Reader', email: 'reader@example.com' };
  const authStore = createMemoryAuthStore(options.storedToken ? { token: options.storedToken, account } : null);
  const fetchImpl: DriveFetch = (url, init) =>
    url.includes('userinfo')
      ? Promise.resolve(jsonResponse(200, { name: account.displayName, email: account.email }))
      : drive.fetchImpl(url, init);
  const provider = createGoogleDriveDeviceFlowProvider({
    config: {
      clientId: 'client',
      clientSecret: 'secret',
      deviceCodeUrl: GOOGLE_DEVICE_CODE_URL,
      tokenUrl: GOOGLE_TOKEN_URL,
      scopes: GOOGLE_DEVICE_FLOW_SCOPES,
    },
    http: createOAuthHttp(options),
    fetchImpl,
    authStore,
    sleep: () => Promise.resolve(),
    now: () => NOW,
    generateId: () => 'boundary',
  });
  return { provider, drive, authStore };
}
