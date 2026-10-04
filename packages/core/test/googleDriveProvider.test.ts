import { describe, expect, it } from 'vitest';
import { err, ok } from '../src/result';
import type { CloudToken, DeviceCodePrompt } from '../src/sync/cloud';
import { GOOGLE_DEVICE_CODE_URL, GOOGLE_DEVICE_FLOW_SCOPES, GOOGLE_TOKEN_URL } from '../src/sync/googleDeviceFlow';
import { createGoogleDeviceFlowProviderForTest } from './fakeDrive';

const NOW = 1_000_000;

describe('createGoogleDriveDeviceFlowProvider', () => {
  it('shows the device code, stores the sign-in and reports the account', async () => {
    const fixture = createGoogleDeviceFlowProviderForTest();
    const prompts: DeviceCodePrompt[] = [];

    const connected = await fixture.provider.connect({ onDeviceCode: (prompt) => prompts.push(prompt) });

    expect(connected).toEqual(ok({ providerId: 'google-drive', displayName: 'Reader', email: 'reader@example.com' }));
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.userCode).toBe('ABCD-EFGH');
    expect(fixture.authStore.current()?.token.refreshToken).toBe('refresh-1');
    expect(await fixture.provider.getAccount()).toEqual(ok(fixture.authStore.current()?.account));
  });

  it('reports a denied sign-in without storing anything', async () => {
    const fixture = createGoogleDeviceFlowProviderForTest({ tokenReplies: [{ status: 403, body: { error: 'access_denied' } }] });

    const connected = await fixture.provider.connect();

    expect(connected).toEqual(err('Sign-in was denied.'));
    expect(fixture.authStore.current()).toBeNull();
  });

  it('forgets the sign-in when disconnected', async () => {
    const fixture = createGoogleDeviceFlowProviderForTest();
    await fixture.provider.connect();

    expect(await fixture.provider.disconnect()).toEqual(ok(undefined));

    expect(fixture.authStore.current()).toBeNull();
    expect(await fixture.provider.getAccount()).toEqual(ok(null));
  });

  it('refuses to open a sync storage before connecting', async () => {
    const fixture = createGoogleDeviceFlowProviderForTest();

    const storage = await fixture.provider.createSyncStorage();

    expect(storage).toEqual(err('Connect Google Drive before syncing.'));
  });

  it('round-trips a file through the Drive app folder', async () => {
    const fixture = createGoogleDeviceFlowProviderForTest();
    await fixture.provider.connect();
    const storage = await fixture.provider.createSyncStorage();
    if (!storage.ok) throw new Error(storage.error);

    expect(await storage.data.readFile('manifest.json')).toEqual(ok(null));
    expect(await storage.data.writeFile('manifest.json', new TextEncoder().encode('one'))).toEqual(ok(undefined));
    expect(await storage.data.writeFile('manifest.json', new TextEncoder().encode('two'))).toEqual(ok(undefined));
    await storage.data.writeFile('blobs/abc', new Uint8Array([1, 2, 3]));

    const manifest = await storage.data.readFile('manifest.json');
    expect(manifest.ok && manifest.data ? new TextDecoder().decode(manifest.data) : null).toBe('two');
    expect(await storage.data.readFile('blobs/abc')).toEqual(ok(new Uint8Array([1, 2, 3])));
    expect(fixture.drive.fileNames()).toEqual(['manifest.json', 'abc']);
  });

  it('refreshes an expired token before calling Drive and saves the new one', async () => {
    const expired: CloudToken = { accessToken: 'old', refreshToken: 'refresh-1', expiresAt: NOW - 1 };
    const fixture = createGoogleDeviceFlowProviderForTest({ storedToken: expired });

    const storage = await fixture.provider.createSyncStorage();
    if (!storage.ok) throw new Error(storage.error);
    await storage.data.readFile('manifest.json');

    expect(fixture.authStore.current()?.token.accessToken).toBe('refreshed-token');
    expect(fixture.authStore.current()?.token.refreshToken).toBe('refresh-1');
    expect(fixture.drive.seenTokens()).toEqual(['refreshed-token']);
  });

  it('retries once with a refreshed token when Drive answers 401', async () => {
    const stale: CloudToken = { accessToken: 'revoked', refreshToken: 'refresh-1', expiresAt: NOW + 3_600_000 };
    const fixture = createGoogleDeviceFlowProviderForTest({ storedToken: stale, rejectToken: 'revoked' });

    const storage = await fixture.provider.createSyncStorage();
    if (!storage.ok) throw new Error(storage.error);
    const read = await storage.data.readFile('manifest.json');

    expect(read).toEqual(ok(null));
    expect(fixture.drive.seenTokens()).toEqual(['revoked', 'refreshed-token']);
  });

  it('asks the reader to reconnect when the refresh token was revoked', async () => {
    const stale: CloudToken = { accessToken: 'old', refreshToken: 'dead', expiresAt: NOW - 1 };
    const fixture = createGoogleDeviceFlowProviderForTest({ storedToken: stale, refreshFails: true });

    const storage = await fixture.provider.createSyncStorage();

    expect(storage).toEqual(err('Google session expired; reconnect your account.'));
  });

  it('keeps the scopes and endpoints the device flow needs', () => {
    expect(GOOGLE_DEVICE_FLOW_SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(GOOGLE_DEVICE_CODE_URL).toContain('device/code');
    expect(GOOGLE_TOKEN_URL).toContain('token');
  });
});
