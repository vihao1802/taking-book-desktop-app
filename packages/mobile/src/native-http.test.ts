import { describe, expect, it, vi } from 'vitest';
import type { HttpOptions, HttpResponse } from '@capacitor/core';

vi.mock('@capacitor/core', () => ({ CapacitorHttp: {} }));

import { createNativeDriveFetch, createNativeOAuthHttp } from './native-http';

function respond(response: Partial<HttpResponse>): (options: HttpOptions) => Promise<HttpResponse> {
  return vi.fn(async () => ({ data: '', status: 200, headers: {}, url: '', ...response }));
}

describe('createNativeDriveFetch', () => {
  it('turns a parsed JSON reply back into bytes and finds headers in any case', async () => {
    const fetchImpl = createNativeDriveFetch(respond({ data: { files: [] }, headers: { 'Content-Type': 'application/json' } }));

    const response = await fetchImpl('https://drive.test/files', { method: 'GET', headers: {} });

    expect(response.headers.get('content-type')).toBe('application/json');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('{"files":[]}');
  });

  it('decodes a binary success reply from base64', async () => {
    const fetchImpl = createNativeDriveFetch(respond({ data: 'AQID', headers: { 'content-type': 'application/octet-stream' } }));

    const response = await fetchImpl('https://drive.test/files/1?alt=media', { method: 'GET', headers: {} });

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reads an error body as text even when the status is not a success', async () => {
    const fetchImpl = createNativeDriveFetch(respond({ status: 500, data: 'backend error', headers: { 'content-type': 'text/plain' } }));

    const response = await fetchImpl('https://drive.test/files', { method: 'GET', headers: {} });

    expect(response.status).toBe(500);
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('backend error');
  });

  it('sends a binary body as base64 file data and a text body as is', async () => {
    const http = respond({});
    const fetchImpl = createNativeDriveFetch(http);

    await fetchImpl('https://drive.test/upload', { method: 'POST', headers: { 'Content-Type': 'multipart/related' }, body: new Uint8Array([1, 2, 3]) });
    await fetchImpl('https://drive.test/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });

    expect(http).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: 'AQID', dataType: 'file', responseType: 'arraybuffer' }));
    expect(http).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: '{"a":1}', method: 'POST' }));
  });
});

describe('createNativeOAuthHttp', () => {
  it('posts the form fields and returns the status and body text', async () => {
    const http = respond({ status: 428, data: { error: 'authorization_pending' } });

    const result = await createNativeOAuthHttp(http).postForm('https://oauth.test/token', { client_id: 'c' });

    expect(result).toEqual({ ok: true, data: { status: 428, body: '{"error":"authorization_pending"}' } });
    expect(http).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://oauth.test/token', method: 'POST', data: { client_id: 'c' } }),
    );
  });

  it('reports a network failure as an error result', async () => {
    const http = vi.fn(async () => {
      throw new Error('Unable to resolve host');
    });

    const result = await createNativeOAuthHttp(http).postForm('https://oauth.test/token', {});

    expect(result).toEqual({ ok: false, error: 'OAuth request failed: Unable to resolve host' });
  });
});
