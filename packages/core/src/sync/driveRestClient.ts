import type { Result } from '../result';
import { err, ok } from '../result';
import { utf8Decode, utf8Encode } from './utf8';

/**
 * Google Drive REST client over an injected `fetch`-shaped function, shared by
 * every platform. Nothing here imports a platform API: the HTTP call, the
 * access token and the id generator are all handed in.
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/** The slice of a fetch response the Drive client reads. */
export interface DriveFetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** The request shape the Drive client sends. */
export interface DriveFetchInit {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string | Uint8Array;
}

/** A `fetch`-compatible function; each platform adapts its own HTTP stack to it. */
export type DriveFetch = (url: string, init: DriveFetchInit) => Promise<DriveFetchResponse>;

/** Everything the Drive client needs from the platform. */
export interface DriveRestClientOptions {
  fetchImpl: DriveFetch;
  /**
   * Returns a valid access token. `forceRefresh` is set after Drive answered
   * 401, so the provider must fetch a new token instead of reusing its cache.
   */
  getAccessToken: (forceRefresh: boolean) => Promise<Result<string>>;
  generateId: () => string;
  driveApiBase?: string;
  driveUploadBase?: string;
}

/** Folder-scoped file operations on Drive, addressed by folder id and file name. */
export interface DriveRestClient {
  ensureFolder(name: string, parentId: string | null): Promise<Result<string>>;
  findFile(folderId: string, name: string): Promise<Result<string | null>>;
  uploadFile(folderId: string, name: string, data: Uint8Array): Promise<Result<void>>;
  downloadFile(folderId: string, name: string): Promise<Result<Uint8Array | null>>;
  deleteFile(folderId: string, name: string): Promise<Result<void>>;
  listFiles(folderId: string): Promise<Result<string[]>>;
}

interface DriveHttpResponse {
  status: number;
  body: string;
  bytes: Uint8Array | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

type RequestFunction = (
  method: DriveFetchInit['method'],
  url: string,
  body?: string | Uint8Array,
  contentType?: string,
) => Promise<Result<DriveHttpResponse>>;

/** Sends one authorised request, retrying once with a fresh token after a 401. */
function createRequestFunction(options: DriveRestClientOptions): RequestFunction {
  return async (method, url, body, contentType) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await options.getAccessToken(attempt > 0);
      if (!token.ok) return token;
      try {
        const res = await options.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token.data}`,
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
          body,
        });
        const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
        const raw = new Uint8Array(await res.arrayBuffer());
        if (res.status === 401 && attempt === 0) continue;
        return ok({ status: res.status, body: isJson ? utf8Decode(raw) : '', bytes: isJson ? null : raw });
      } catch (error) {
        return err(`Drive request failed: ${errorMessage(error)}`);
      }
    }
    return err('Drive request failed even after a token refresh.');
  };
}

function buildMultipartBody(boundary: string, metadata: string, data: Uint8Array): Uint8Array {
  const header = utf8Encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const footer = utf8Encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(header.length + data.length + footer.length);
  body.set(header, 0);
  body.set(data, header.length);
  body.set(footer, header.length + data.length);
  return body;
}

/**
 * Creates the Drive REST client.
 *
 * @param options The HTTP function, the access-token supplier and the id generator.
 * @returns Folder and file operations that report failures as error results.
 */
export function createDriveRestClient(options: DriveRestClientOptions): DriveRestClient {
  const apiBase = options.driveApiBase ?? DRIVE_API_BASE;
  const uploadBase = options.driveUploadBase ?? DRIVE_UPLOAD_BASE;
  const request = createRequestFunction(options);

  async function apiJson(path: string): Promise<Result<unknown | null>> {
    const res = await request('GET', `${apiBase}${path}`);
    if (!res.ok) return res;
    if (res.data.status === 404) return ok(null);
    if (!isSuccess(res.data.status)) return err(`Drive API HTTP ${res.data.status}: ${res.data.body}`);
    try {
      return ok(JSON.parse(res.data.body) as unknown);
    } catch {
      return err('Drive API returned a malformed JSON body.');
    }
  }

  async function fileIdByName(folderId: string, name: string): Promise<Result<string | null>> {
    const q = encodeURIComponent(
      `name = '${escapeDriveQueryValue(name)}' and '${folderId}' in parents and trashed = false`,
    );
    const json = await apiJson(`/files?q=${q}&fields=files(id,name)&pageSize=1000`);
    if (!json.ok) return json;
    if (!json.data) return ok(null);
    const files = (json.data as { files?: { id: string }[] }).files ?? [];
    return ok(files[0]?.id ?? null);
  }

  async function ensureFolder(name: string, parentId: string | null): Promise<Result<string>> {
    const parentQuery = parentId ? `'${parentId}' in parents and ` : "'root' in parents and ";
    const q = encodeURIComponent(
      `${parentQuery}name = '${escapeDriveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    const existing = await apiJson(`/files?q=${q}&fields=files(id,name)`);
    if (!existing.ok) return existing;
    const found = (existing.data as { files?: { id: string }[] } | null)?.files?.[0]?.id;
    if (found) return ok(found);
    const created = await request(
      'POST',
      `${apiBase}/files`,
      JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      }),
      'application/json',
    );
    if (!created.ok) return created;
    if (!isSuccess(created.data.status)) {
      return err(`Drive create folder HTTP ${created.data.status}: ${created.data.body}`);
    }
    return ok((JSON.parse(created.data.body) as { id: string }).id);
  }

  async function uploadFile(folderId: string, name: string, data: Uint8Array): Promise<Result<void>> {
    const existing = await fileIdByName(folderId, name);
    if (!existing.ok) return existing;
    if (existing.data) {
      const res = await request('PATCH', `${uploadBase}/files/${existing.data}?uploadType=media`, data, 'application/octet-stream');
      if (!res.ok) return res;
      return isSuccess(res.data.status) ? ok(undefined) : err(`Drive update HTTP ${res.data.status}: ${res.data.body}`);
    }
    const boundary = `tb-${options.generateId()}`;
    const body = buildMultipartBody(boundary, JSON.stringify({ name, parents: [folderId] }), data);
    const res = await request('POST', `${uploadBase}/files?uploadType=multipart`, body, `multipart/related; boundary=${boundary}`);
    if (!res.ok) return res;
    return isSuccess(res.data.status) ? ok(undefined) : err(`Drive upload HTTP ${res.data.status}: ${res.data.body}`);
  }

  async function downloadFile(folderId: string, name: string): Promise<Result<Uint8Array | null>> {
    const fileId = await fileIdByName(folderId, name);
    if (!fileId.ok) return fileId;
    if (!fileId.data) return ok(null);
    const res = await request('GET', `${apiBase}/files/${fileId.data}?alt=media`);
    if (!res.ok) return res;
    if (res.data.status === 404) return ok(null);
    if (!isSuccess(res.data.status)) return err(`Drive download HTTP ${res.data.status}: ${res.data.body}`);
    return ok(res.data.bytes);
  }

  async function deleteFile(folderId: string, name: string): Promise<Result<void>> {
    const fileId = await fileIdByName(folderId, name);
    if (!fileId.ok) return fileId;
    if (!fileId.data) return ok(undefined);
    const res = await request('DELETE', `${apiBase}/files/${fileId.data}`);
    if (!res.ok) return res;
    return isSuccess(res.data.status) ? ok(undefined) : err(`Drive delete HTTP ${res.data.status}: ${res.data.body}`);
  }

  async function listFiles(folderId: string): Promise<Result<string[]>> {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const json = await apiJson(`/files?q=${q}&fields=files(id,name)`);
    if (!json.ok) return json;
    const files = (json.data as { files?: { name: string }[] } | null)?.files ?? [];
    return ok(files.map((file) => file.name));
  }

  return { ensureFolder, findFile: fileIdByName, uploadFile, downloadFile, deleteFile, listFiles };
}
