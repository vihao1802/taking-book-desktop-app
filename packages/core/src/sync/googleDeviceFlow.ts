import type { Result } from '../result';
import { err, ok } from '../result';
import type { CloudToken, DeviceCodePrompt, OAuthClientConfig, OAuthHttpClient, OAuthTokenResponse } from './cloud';
import { parseTokenResponse, refreshAccessToken } from './cloud';

/**
 * Google's OAuth 2.0 device flow (ADR-0010): request a code, hand it to the
 * caller to show, poll until the reader approves, and obtain a refresh token.
 * All HTTP goes through the injected client and all waiting through the
 * injected `sleep`, so nothing here touches a platform API.
 */

/** `drive.file` for the Books folder, plus the identity scopes for the account label. */
export const GOOGLE_DEVICE_FLOW_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
  'profile',
];

export const GOOGLE_DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_STEP_SECONDS = 5;
const MILLISECONDS_PER_SECOND = 1000;
const DEFAULT_REFRESH_SKEW_MS = 60 * MILLISECONDS_PER_SECOND;

/** OAuth client of type "TVs and Limited Input devices". */
export interface DeviceFlowConfig {
  clientId: string;
  clientSecret: string;
  deviceCodeUrl: string;
  tokenUrl: string;
  scopes: readonly string[];
}

/** Why the flow ended without a token. */
export type DeviceFlowFailureKind = 'denied' | 'expired' | 'failed';

export interface DeviceFlowError {
  kind: DeviceFlowFailureKind;
  message: string;
}

/** Injected platform pieces: HTTP, a wait, and the clock. */
export interface DeviceFlowOptions {
  http: OAuthHttpClient;
  config: DeviceFlowConfig;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => number;
  /** Called once, before polling, so the UI can show the code and address. */
  onDeviceCode: (prompt: DeviceCodePrompt) => void;
}

/** A parsed device-code response. */
export interface DeviceCodeGrant {
  deviceCode: string;
  prompt: DeviceCodePrompt;
  intervalSeconds: number;
}

function fail(kind: DeviceFlowFailureKind, message: string): Result<never, DeviceFlowError> {
  return err({ kind, message });
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

function readPositiveNumber(record: Record<string, unknown>, key: string): number | null {
  const value = Number(record[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Parses the device-code endpoint body, rejecting anything that lacks the fields the flow needs. */
export function parseDeviceCodeResponse(json: unknown, now: number): Result<DeviceCodeGrant> {
  if (typeof json !== 'object' || json === null) return err('Device code response is not an object');
  const record = json as Record<string, unknown>;
  const deviceCode = readString(record, 'device_code');
  const userCode = readString(record, 'user_code');
  const verificationUrl = readString(record, 'verification_url') ?? readString(record, 'verification_uri');
  const expiresIn = readPositiveNumber(record, 'expires_in');
  if (!deviceCode || !userCode || !verificationUrl || expiresIn === null) {
    return err('Device code response is missing required fields');
  }
  return ok({
    deviceCode,
    intervalSeconds: readPositiveNumber(record, 'interval') ?? DEFAULT_POLL_INTERVAL_SECONDS,
    prompt: { userCode, verificationUrl, expiresAt: now + expiresIn * MILLISECONDS_PER_SECOND },
  });
}

async function requestDeviceCode(options: DeviceFlowOptions): Promise<Result<DeviceCodeGrant, DeviceFlowError>> {
  const { http, config, now } = options;
  const response = await http.postForm(config.deviceCodeUrl, {
    client_id: config.clientId,
    scope: config.scopes.join(' '),
  });
  if (!response.ok) return fail('failed', response.error);
  if (response.data.status < 200 || response.data.status >= 300) {
    return fail('failed', `Device code endpoint returned HTTP ${response.data.status}: ${response.data.body}`);
  }
  const grant = parseDeviceCodeResponse(parseJson(response.data.body), now());
  return grant.ok ? grant : fail('failed', grant.error);
}

type PollOutcome =
  | { kind: 'token'; token: OAuthTokenResponse }
  | { kind: 'pending' }
  | { kind: 'slow-down' }
  | { kind: 'error'; error: DeviceFlowError };

function expiredError(): DeviceFlowError {
  return { kind: 'expired', message: 'The sign-in code expired. Start again to get a new code.' };
}

function classifyPollError(status: number, body: string): PollOutcome {
  const parsed = parseJson(body);
  const code = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).error : undefined;
  if (code === 'authorization_pending') return { kind: 'pending' };
  if (code === 'slow_down') return { kind: 'slow-down' };
  if (code === 'access_denied') {
    return { kind: 'error', error: { kind: 'denied', message: 'Sign-in was denied.' } };
  }
  if (code === 'expired_token') return { kind: 'error', error: expiredError() };
  return { kind: 'error', error: { kind: 'failed', message: `Token endpoint returned HTTP ${status}: ${body}` } };
}

async function pollOnce(options: DeviceFlowOptions, deviceCode: string): Promise<PollOutcome> {
  const { http, config } = options;
  const response = await http.postForm(config.tokenUrl, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    device_code: deviceCode,
    grant_type: DEVICE_GRANT_TYPE,
  });
  // A network failure while polling is not fatal: the reader may still be approving.
  if (!response.ok) return { kind: 'pending' };
  const { status, body } = response.data;
  if (status < 200 || status >= 300) return classifyPollError(status, body);
  const token = parseTokenResponse(parseJson(body));
  return token.ok
    ? { kind: 'token', token: token.data }
    : { kind: 'error', error: { kind: 'failed', message: token.error } };
}

/**
 * Runs the whole device flow: requests a code, passes it to `onDeviceCode`,
 * then polls at the server's interval (adding 5 s on every slow-down) until
 * the reader approves, denies, or the code expires.
 *
 * @returns the token pair on approval, or a {@link DeviceFlowError} saying why not.
 */
export async function signInWithDeviceFlow(options: DeviceFlowOptions): Promise<Result<CloudToken, DeviceFlowError>> {
  const grant = await requestDeviceCode(options);
  if (!grant.ok) return grant;
  const { deviceCode, prompt } = grant.data;
  options.onDeviceCode(prompt);

  let intervalSeconds = grant.data.intervalSeconds;
  while (options.now() < prompt.expiresAt) {
    await options.sleep(intervalSeconds * MILLISECONDS_PER_SECOND);
    const outcome = await pollOnce(options, deviceCode);
    if (outcome.kind === 'token') {
      const { accessToken, refreshToken, expiresInSeconds } = outcome.token;
      return ok({ accessToken, refreshToken, expiresAt: options.now() + expiresInSeconds * MILLISECONDS_PER_SECOND });
    }
    if (outcome.kind === 'error') return err(outcome.error);
    if (outcome.kind === 'slow-down') intervalSeconds += SLOW_DOWN_STEP_SECONDS;
  }
  return err(expiredError());
}

/** Options for {@link ensureFreshToken}. */
export interface EnsureFreshTokenOptions {
  http: OAuthHttpClient;
  config: DeviceFlowConfig;
  token: CloudToken;
  now: () => number;
  /** Refresh this long before the real expiry so a request never carries a stale token. */
  skewMilliseconds?: number;
}

/**
 * Returns the token unchanged while it is still valid, otherwise refreshes it.
 * Google omits the refresh token on refresh, so the stored one is kept.
 */
export async function ensureFreshToken(options: EnsureFreshTokenOptions): Promise<Result<CloudToken>> {
  const { http, config, token, now } = options;
  const skew = options.skewMilliseconds ?? DEFAULT_REFRESH_SKEW_MS;
  if (now() + skew < token.expiresAt) return ok(token);
  if (!token.refreshToken) return err('Google session expired; reconnect your account.');

  const oauthConfig: OAuthClientConfig = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorizationUrl: '',
    tokenUrl: config.tokenUrl,
    redirectUri: '',
    scopes: [...config.scopes],
  };
  const refreshed = await refreshAccessToken(http, oauthConfig, token.refreshToken);
  if (!refreshed.ok) return refreshed;
  return ok({
    accessToken: refreshed.data.accessToken,
    refreshToken: refreshed.data.refreshToken ?? token.refreshToken,
    expiresAt: now() + refreshed.data.expiresInSeconds * MILLISECONDS_PER_SECOND,
  });
}
