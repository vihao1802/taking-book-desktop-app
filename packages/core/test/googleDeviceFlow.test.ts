import { describe, expect, it } from 'vitest';
import type { DeviceCodePrompt, OAuthHttpClient } from '../src/sync/cloud';
import { err, ok } from '../src/result';
import {
  GOOGLE_DEVICE_CODE_URL,
  GOOGLE_DEVICE_FLOW_SCOPES,
  GOOGLE_TOKEN_URL,
  ensureFreshToken,
  parseDeviceCodeResponse,
  signInWithDeviceFlow,
  type DeviceFlowConfig,
} from '../src/sync/googleDeviceFlow';

const config: DeviceFlowConfig = {
  clientId: 'client',
  clientSecret: 'secret',
  deviceCodeUrl: GOOGLE_DEVICE_CODE_URL,
  tokenUrl: GOOGLE_TOKEN_URL,
  scopes: GOOGLE_DEVICE_FLOW_SCOPES,
};

type Reply = { status: number; body: unknown } | 'network-error';

const deviceCodeBody = {
  device_code: 'dev',
  user_code: 'ABCD-EFGH',
  verification_url: 'https://google.com/device',
  expires_in: 1800,
  interval: 5,
};
const deviceCodeReply: Reply = { status: 200, body: deviceCodeBody };
const tokenReply: Reply = { status: 200, body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } };
const pending: Reply = { status: 428, body: { error: 'authorization_pending' } };

class FakeClock {
  time = 1_000_000;
  sleeps: number[] = [];
  now = (): number => this.time;
  sleep = (milliseconds: number): Promise<void> => {
    this.sleeps.push(milliseconds);
    this.time += milliseconds;
    return Promise.resolve();
  };
}

interface RecordedCall {
  url: string;
  params: Record<string, string>;
}

function fakeHttp(replies: Reply[]): { http: OAuthHttpClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queue = [...replies];
  const http: OAuthHttpClient = {
    postForm(url, params) {
      calls.push({ url, params });
      const reply = queue.shift();
      if (reply === undefined) return Promise.resolve(err('unexpected request'));
      if (reply === 'network-error') return Promise.resolve(err('offline'));
      return Promise.resolve(ok({ status: reply.status, body: JSON.stringify(reply.body) }));
    },
  };
  return { http, calls };
}

function run(replies: Reply[]) {
  const clock = new FakeClock();
  const { http, calls } = fakeHttp(replies);
  const prompts: DeviceCodePrompt[] = [];
  const result = signInWithDeviceFlow({
    http,
    config,
    sleep: clock.sleep,
    now: clock.now,
    onDeviceCode: (prompt) => prompts.push(prompt),
  });
  return { result, clock, calls, prompts };
}

async function failureKind(replies: Reply[]): Promise<string> {
  const outcome = await run(replies).result;
  if (outcome.ok) throw new Error('expected failure');
  return outcome.error.kind;
}

describe('signInWithDeviceFlow', () => {
  it('requests the drive.file, openid, email and profile scopes', async () => {
    const { result, calls } = run([deviceCodeReply, tokenReply]);
    await result;
    expect(calls[0].url).toBe(GOOGLE_DEVICE_CODE_URL);
    expect(calls[0].params.scope.split(' ')).toEqual([
      'https://www.googleapis.com/auth/drive.file',
      'openid',
      'email',
      'profile',
    ]);
  });

  it('shows the code, polls through pending and returns a refresh token on approval', async () => {
    const { result, clock, calls, prompts } = run([deviceCodeReply, pending, pending, tokenReply]);
    const outcome = await result;
    expect(prompts).toEqual([
      { userCode: 'ABCD-EFGH', verificationUrl: 'https://google.com/device', expiresAt: 1_000_000 + 1_800_000 },
    ]);
    expect(clock.sleeps).toEqual([5000, 5000, 5000]);
    expect(calls[3].params).toMatchObject({
      device_code: 'dev',
      client_secret: 'secret',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    expect(outcome).toEqual({
      ok: true,
      data: { accessToken: 'at', refreshToken: 'rt', expiresAt: clock.time + 3_600_000 },
    });
  });

  it('waits 5 seconds longer after each slow-down', async () => {
    const slowDown: Reply = { status: 400, body: { error: 'slow_down' } };
    const { result, clock } = run([deviceCodeReply, slowDown, slowDown, tokenReply]);
    await result;
    expect(clock.sleeps).toEqual([5000, 10_000, 15_000]);
  });

  it('reports denial', async () => {
    expect(await failureKind([deviceCodeReply, { status: 403, body: { error: 'access_denied' } }])).toBe('denied');
  });

  it('reports expiry when the server says the code expired', async () => {
    expect(await failureKind([deviceCodeReply, { status: 400, body: { error: 'expired_token' } }])).toBe('expired');
  });

  it('reports expiry when the code lifetime passes while still pending', async () => {
    const shortLived: Reply = { status: 200, body: { ...deviceCodeBody, expires_in: 10 } };
    const { result, calls } = run([shortLived, pending, pending]);
    const outcome = await result;
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.error.kind).toBe('expired');
    expect(calls).toHaveLength(3);
  });

  it('keeps polling through a transient network failure', async () => {
    const { result } = run([deviceCodeReply, 'network-error', tokenReply]);
    expect((await result).ok).toBe(true);
  });

  it('fails without showing a code when the device code request fails', async () => {
    const { result, prompts } = run([{ status: 401, body: { error: 'invalid_client' } }]);
    const outcome = await result;
    if (outcome.ok) throw new Error('expected failure');
    expect(outcome.error.kind).toBe('failed');
    expect(prompts).toEqual([]);
  });

  it('fails on an unknown polling error', async () => {
    expect(await failureKind([deviceCodeReply, { status: 400, body: { error: 'invalid_client' } }])).toBe('failed');
  });
});

describe('parseDeviceCodeResponse', () => {
  it('rejects a payload with missing fields', () => {
    expect(parseDeviceCodeResponse({ device_code: 'x' }, 0).ok).toBe(false);
    expect(parseDeviceCodeResponse(null, 0).ok).toBe(false);
  });
});

describe('ensureFreshToken', () => {
  const clock = new FakeClock();

  it('returns a still-valid token without any request', async () => {
    const { http, calls } = fakeHttp([]);
    const token = { accessToken: 'a', refreshToken: 'r', expiresAt: clock.time + 3_600_000 };
    const result = await ensureFreshToken({ http, config, token, now: clock.now });
    expect(result).toEqual({ ok: true, data: token });
    expect(calls).toHaveLength(0);
  });

  it('refreshes an expired token and keeps the stored refresh token', async () => {
    const { http, calls } = fakeHttp([{ status: 200, body: { access_token: 'new', expires_in: 3600 } }]);
    const token = { accessToken: 'old', refreshToken: 'r', expiresAt: clock.time - 1 };
    const result = await ensureFreshToken({ http, config, token, now: clock.now });
    expect(calls[0].params).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'r', client_secret: 'secret' });
    expect(result).toEqual({
      ok: true,
      data: { accessToken: 'new', refreshToken: 'r', expiresAt: clock.time + 3_600_000 },
    });
  });

  it('errors when expired without a refresh token', async () => {
    const { http } = fakeHttp([]);
    const token = { accessToken: 'old', refreshToken: null, expiresAt: clock.time - 1 };
    expect((await ensureFreshToken({ http, config, token, now: clock.now })).ok).toBe(false);
  });

  it('surfaces a refresh failure', async () => {
    const { http } = fakeHttp([{ status: 400, body: { error: 'invalid_grant' } }]);
    const token = { accessToken: 'old', refreshToken: 'r', expiresAt: clock.time - 1 };
    expect((await ensureFreshToken({ http, config, token, now: clock.now })).ok).toBe(false);
  });
});
