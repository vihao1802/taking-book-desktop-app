import { CapacitorHttp, type HttpOptions, type HttpResponse } from '@capacitor/core';
import { err, ok, type DriveFetch, type OAuthHttpClient, type Result } from '@taking-book/core';
import { base64ToBytes } from './base64-to-bytes';
import { bytesToBase64 } from './bytes-to-base64';

/** Sends a request through the platform's native HTTP stack. */
export type NativeHttp = (options: HttpOptions) => Promise<HttpResponse>;

const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/** The Capacitor native HTTP plugin, used because Google's endpoints do not all allow WebView (CORS) requests. */
export const capacitorHttp: NativeHttp = (options) => CapacitorHttp.request(options);

function findHeader(headers: Record<string, string>, name: string): string | null {
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === wanted);
  return key === undefined ? null : (headers[key] ?? null);
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * The plugin hands back parsed JSON for JSON responses, base64 for binary
 * success responses, and plain text for error bodies; this puts all three
 * back into bytes.
 */
function responseBytes(response: HttpResponse): Uint8Array {
  const contentType = findHeader(response.headers, 'content-type') ?? '';
  const succeeded = response.status >= 200 && response.status < 300;
  if (typeof response.data !== 'string') return utf8Bytes(JSON.stringify(response.data ?? null));
  if (succeeded && !contentType.includes('json')) return base64ToBytes(response.data);
  return utf8Bytes(response.data);
}

/** Binary bodies go as base64 with `dataType: 'file'`; text bodies go as they are. */
function requestBody(body: string | Uint8Array | undefined): Partial<HttpOptions> {
  if (body === undefined) return {};
  if (typeof body === 'string') return { data: body };
  return { data: bytesToBase64(body), dataType: 'file' };
}

/**
 * Adapts native HTTP to the fetch-shaped function the Drive client uses.
 * Binary bodies travel as base64 (`dataType: 'file'`) and every response is
 * read as bytes, so manifests and PDFs go through the same path.
 *
 * @param http The native HTTP function.
 * @returns A Drive fetch function.
 */
export function createNativeDriveFetch(http: NativeHttp): DriveFetch {
  return async (url, init) => {
    const response = await http({
      url,
      method: init.method,
      headers: init.headers,
      responseType: 'arraybuffer',
      ...requestBody(init.body),
    });
    const bytes = responseBytes(response);
    return {
      status: response.status,
      headers: { get: (name) => findHeader(response.headers, name) },
      arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer),
    };
  };
}

/**
 * Adapts native HTTP to the form-post client the OAuth device flow uses.
 *
 * @param http The native HTTP function.
 * @returns An OAuth HTTP client; a network failure is an error result, not a throw.
 */
export function createNativeOAuthHttp(http: NativeHttp): OAuthHttpClient {
  return {
    async postForm(url, params): Promise<Result<{ status: number; body: string }>> {
      try {
        const response = await http({ url, method: 'POST', headers: { 'Content-Type': FORM_CONTENT_TYPE }, data: params });
        return ok({ status: response.status, body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? null) });
      } catch (error) {
        return err(`OAuth request failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}
