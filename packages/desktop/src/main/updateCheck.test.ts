import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { findAppBundle, isAvailableUpdate, isReleaseDownloadUrl, selectDownloadAction } from './updateCheck';

vi.mock('electron', () => ({ app: {}, ipcMain: {}, net: {}, shell: {} }));

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
