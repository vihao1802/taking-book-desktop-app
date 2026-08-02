import { describe, expect, it } from 'vitest';
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  parseTokenResponse,
  refreshAccessToken,
  type OAuthClientConfig,
  type OAuthHttpClient,
} from '../src/sync/cloud';

const config: OAuthClientConfig = {
  clientId: 'abc.apps.googleusercontent.com',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  redirectUri: 'http://127.0.0.1:3123/',
  scopes: ['https://www.googleapis.com/auth/drive.file'],
};

describe('buildAuthorizationUrl', () => {
  it('encodes client id, redirect, scopes and state', () => {
    const url = buildAuthorizationUrl(config, 'state-1');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe(config.clientId);
    expect(parsed.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(parsed.searchParams.get('scope')).toBe(config.scopes.join(' '));
    expect(parsed.searchParams.get('state')).toBe('state-1');
    expect(parsed.searchParams.get('response_type')).toBe('code');
  });

  it('includes extra provider params', () => {
    const url = buildAuthorizationUrl(config, 's', { access_type: 'offline', prompt: 'consent' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('prompt')).toBe('consent');
  });
});

describe('parseTokenResponse', () => {
  it('parses a valid token response', () => {
    const result = parseTokenResponse({
      access_token: 'token-a',
      refresh_token: 'refresh-a',
      expires_in: 3599,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.accessToken).toBe('token-a');
      expect(result.data.refreshToken).toBe('refresh-a');
      expect(result.data.expiresInSeconds).toBe(3599);
    }
  });

  it('accepts a response without a refresh token', () => {
    const result = parseTokenResponse({ access_token: 't', expires_in: 60 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.refreshToken).toBeNull();
  });

  it('rejects a missing or malformed access token', () => {
    expect(parseTokenResponse({ expires_in: 60 }).ok).toBe(false);
    expect(parseTokenResponse({ access_token: 123, expires_in: 60 }).ok).toBe(false);
    expect(parseTokenResponse(null).ok).toBe(false);
  });

  it('rejects an invalid expiry', () => {
    expect(parseTokenResponse({ access_token: 't', expires_in: -1 }).ok).toBe(false);
    expect(parseTokenResponse({ access_token: 't' }).ok).toBe(false);
  });
});

describe('exchangeAuthorizationCode', () => {
  it('posts the right form and returns the token', async () => {
    let posted: Record<string, string> | null = null;
    const http: OAuthHttpClient = {
      postForm: async (url, params) => {
        posted = params;
        return { ok: true, data: { status: 200, body: JSON.stringify({ access_token: 't', refresh_token: 'r', expires_in: 3600 }) } };
      },
    };

    const result = await exchangeAuthorizationCode(http, config, 'code-9');
    expect(result.ok).toBe(true);
    expect(posted).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-9',
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
    });
  });

  it('returns an error on a non-2xx response', async () => {
    const http: OAuthHttpClient = {
      postForm: async () => ({ ok: true, data: { status: 400, body: '{"error":"invalid_grant"}' } }),
    };
    const result = await exchangeAuthorizationCode(http, config, 'code-9');
    expect(result.ok).toBe(false);
  });
});

describe('refreshAccessToken', () => {
  it('posts grant_type=refresh_token', async () => {
    let posted: Record<string, string> | null = null;
    const http: OAuthHttpClient = {
      postForm: async (_url, params) => {
        posted = params;
        return { ok: true, data: { status: 200, body: JSON.stringify({ access_token: 'new', expires_in: 3600 }) } };
      },
    };

    const result = await refreshAccessToken(http, config, 'refresh-1');
    expect(result.ok).toBe(true);
    expect(posted).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1' });
    if (result.ok) expect(result.data.accessToken).toBe('new');
  });

  it('propagates http failures', async () => {
    const http: OAuthHttpClient = {
      postForm: async () => ({ ok: false, error: 'network down' }),
    };
    const result = await refreshAccessToken(http, config, 'refresh-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('network down');
  });
});
