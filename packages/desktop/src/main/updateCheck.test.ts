import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shell } from 'electron';
import { err, ok } from '@taking-book/core';
import { findAppBundle, isAvailableUpdate, isReleaseDownloadUrl, openWithSystemHandler, selectDownloadAction } from './updateCheck';

vi.mock('electron', () => ({ app: {}, ipcMain: {}, net: {}, shell: { openPath: vi.fn() } }));

describe('isReleaseDownloadUrl', () => {
  it.each([
    'https://github.com/vihao1802/taking-book-desktop-app/releases/download/v1.3.0/taking-book-desktop_1.3.0_amd64.deb',
    'https://github.com/vihao1802/taking-book-desktop-app/releases/tag/v1.3.0',
  ])('allows %s', (url) => {
    expect(isReleaseDownloadUrl(url)).toBe(true);
  });

  it.each([
    'https://github.com/someone-else/taking-book-desktop-app/releases/download/v1/x.deb',
    'https://github.com/vihao1802/taking-book-releases/releases/download/v1/x.deb',
    'https://github.com.evil.test/vihao1802/taking-book-desktop-app/releases/x',
    'http://github.com/vihao1802/taking-book-desktop-app/releases/x',
    'https://github.com/vihao1802/taking-book-desktop-app/releases/../../other',
    'file:///etc/passwd',
    42,
  ])('refuses %s', (url) => {
    expect(isReleaseDownloadUrl(url)).toBe(false);
  });
});

describe('isAvailableUpdate', () => {
  it('accepts an update with a matching asset', () => {
    const update = { version: '1.3.0', pageUrl: 'https://example.test/tag', asset: { name: 'a.deb', downloadUrl: 'https://example.test/a.deb' } };
    expect(isAvailableUpdate(update)).toBe(true);
  });

  it('accepts an update with no asset', () => {
    expect(isAvailableUpdate({ version: '1.3.0', pageUrl: 'https://example.test/tag', asset: null })).toBe(true);
  });

  it.each([
    null,
    42,
    {},
    { version: '1.3.0', pageUrl: 'https://example.test/tag' },
    { version: 1, pageUrl: 'https://example.test/tag', asset: null },
    { version: '1.3.0', pageUrl: 'https://example.test/tag', asset: { name: 'a.deb' } },
    { version: '1.3.0', pageUrl: 'https://example.test/tag', asset: { downloadUrl: 'https://example.test/a.deb' } },
  ])('rejects %j', (value) => {
    expect(isAvailableUpdate(value)).toBe(false);
  });
});

describe('selectDownloadAction', () => {
  const REPO = 'https://github.com/vihao1802/taking-book-desktop-app/releases';

  it('downloads the asset when one matches this device', () => {
    const asset = { name: 'a.deb', downloadUrl: `${REPO}/download/v1.3.0/a.deb` };
    const update = { version: '1.3.0', pageUrl: `${REPO}/tag/v1.3.0`, asset };
    expect(selectDownloadAction(update)).toEqual({ kind: 'download-asset', asset });
  });

  it('opens the release page when there is no matching asset', () => {
    const pageUrl = `${REPO}/tag/v1.3.0`;
    const update = { version: '1.3.0', pageUrl, asset: null };
    expect(selectDownloadAction(update)).toEqual({ kind: 'open-browser', url: pageUrl });
  });

  it('rejects a malformed payload', () => {
    expect(selectDownloadAction({ version: '1.3.0' })).toEqual({ kind: 'rejected', reason: 'Not a valid update.' });
  });

  it('rejects an asset download URL outside this app’s releases', () => {
    const asset = { name: 'a.deb', downloadUrl: 'https://evil.test/a.deb' };
    const update = { version: '1.3.0', pageUrl: `${REPO}/tag/v1.3.0`, asset };
    expect(selectDownloadAction(update).kind).toBe('rejected');
  });

  it('rejects a page URL outside this app’s releases', () => {
    const update = { version: '1.3.0', pageUrl: 'https://evil.test/tag/v1.3.0', asset: null };
    expect(selectDownloadAction(update).kind).toBe('rejected');
  });
});

describe('openWithSystemHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(shell.openPath).mockReset();
  });

  it('succeeds once shell.openPath resolves with no error', async () => {
    vi.mocked(shell.openPath).mockResolvedValue('');
    await expect(openWithSystemHandler('/tmp/a.deb')).resolves.toEqual(ok(undefined));
  });

  it('fails when shell.openPath resolves with an error before the timeout', async () => {
    vi.mocked(shell.openPath).mockResolvedValue('no handler for this file');
    await expect(openWithSystemHandler('/tmp/a.deb')).resolves.toEqual(err('Could not open the downloaded installer.'));
  });

  it('treats a handler that has launched but not yet exited as success', async () => {
    // A package-install GUI (GNOME Software, gdebi, …) can hold shell.openPath's
    // promise pending until it closes, which may itself be waiting on this app
    // to quit — the race against a timeout is what breaks that deadlock.
    vi.mocked(shell.openPath).mockReturnValue(new Promise(() => {}));
    const result = openWithSystemHandler('/tmp/a.deb');
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toEqual(ok(undefined));
  });
});

describe('findAppBundle', () => {
  it('finds the .app in a directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'taking-book-update-test-'));
    await writeFile(path.join(dir, 'README.txt'), '');
    await writeFile(path.join(dir, 'Taking Book.app'), '');
    expect(await findAppBundle(dir)).toBe(path.join(dir, 'Taking Book.app'));
  });

  it('returns null when there is no .app', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'taking-book-update-test-'));
    await writeFile(path.join(dir, 'README.txt'), '');
    expect(await findAppBundle(dir)).toBeNull();
  });
});
