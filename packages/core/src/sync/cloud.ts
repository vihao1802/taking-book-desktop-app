import type { Result } from '../result';
import { err, ok } from '../result';
import type { SyncStorage } from './types';

/**
 * OAuth-based cloud provider support. The platform-independent pieces live
 * here: the provider contract, the token/account shapes, and the pure OAuth
 * helpers (build the consent URL, parse a token response, exchange an
 * authorization code, refresh). HTTP is injected via {@link OAuthHttpClient}
 * so nothing here imports Electron or Node.
 */

/** An OAuth token pair with the epoch-ms expiry of the access token. */
export interface CloudToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

/** The identity of the connected cloud account, shown in the UI. */
export interface CloudAccount {
  providerId: string;
  displayName: string;
  email: string;
}

/**
 * A cloud provider capable of producing a {@link SyncStorage}. Implementations
 * live in platform packages (the desktop wires OAuth over Electron); the
 * contract is shared so the library UI only ever sees this interface.
 */
export interface CloudProvider {
  /** Stable id used in settings keys, e.g. `google-drive`. */
  readonly providerId: string;
  /** Human-readable name shown in the UI, e.g. "Google Drive". */
  readonly providerName: string;
  /** Returns the connected account, or null when not connected. */
  getAccount(): Promise<Result<CloudAccount | null>>;
  /** Starts the OAuth flow and returns the account once connected. */
  connect(): Promise<Result<CloudAccount>>;
  /** Forgets the stored token. */
  disconnect(): Promise<Result<void>>;
  /**
   * Returns a storage handle over the connected account, or an error when the
   * user has not connected yet.
   */
  createSyncStorage(): Promise<Result<SyncStorage>>;
}

/** OAuth client settings for a single provider. */
export interface OAuthClientConfig {
  clientId: string;
  clientSecret?: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

/** Minimal HTTP surface the pure OAuth helpers need. */
export interface OAuthHttpClient {
  postForm(url: string, params: Record<string, string>): Promise<Result<{ status: number; body: string }>>;
}

/** A parsed token response before it is turned into a {@link CloudToken}. */
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
}

/**
 * Builds the consent URL to open in a browser. `extraParams` lets a provider
 * add flow-specific values (Google needs `access_type=offline` and
 * `prompt=consent`).
 */
export function buildAuthorizationUrl(
  config: OAuthClientConfig,
  state: string,
  extraParams: Record<string, string> = {},
): string {
  const params: Record<string, string> = {
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    ...extraParams,
  };
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${config.authorizationUrl}?${query}`;
}

/**
 * Parses an OAuth token endpoint response, rejecting anything that is not a
 * token payload so callers never trust a malformed body.
 */
export function parseTokenResponse(json: unknown): Result<OAuthTokenResponse> {
  if (typeof json !== 'object' || json === null) return err('Token response is not an object');
  const record = json as Record<string, unknown>;
  if (typeof record.access_token !== 'string' || record.access_token === '') {
    return err('Token response is missing access_token');
  }
  const expiresIn = Number(record.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    return err('Token response has an invalid expires_in');
  }
  return ok({
    accessToken: record.access_token,
    refreshToken: typeof record.refresh_token === 'string' && record.refresh_token !== '' ? record.refresh_token : null,
    expiresInSeconds: expiresIn,
  });
}

/**
 * Exchanges an authorization code for a token pair. Kept in core so the
 * desktop flow and a future mobile client share the same request shape.
 */
export async function exchangeAuthorizationCode(
  http: OAuthHttpClient,
  config: OAuthClientConfig,
  code: string,
): Promise<Result<OAuthTokenResponse>> {
  const response = await http.postForm(config.tokenUrl, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
  });
  if (!response.ok) return response;
  if (response.data.status < 200 || response.data.status >= 300) {
    return err(`Token endpoint returned HTTP ${response.data.status}: ${response.data.body}`);
  }
  return parseTokenResponse(parseJson(response.data.body));
}

/** Refreshes an expired access token with the stored refresh token. */
export async function refreshAccessToken(
  http: OAuthHttpClient,
  config: OAuthClientConfig,
  refreshToken: string,
): Promise<Result<OAuthTokenResponse>> {
  const response = await http.postForm(config.tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
  });
  if (!response.ok) return response;
  if (response.data.status < 200 || response.data.status >= 300) {
    return err(`Token endpoint returned HTTP ${response.data.status}: ${response.data.body}`);
  }
  return parseTokenResponse(parseJson(response.data.body));
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
