import { describe, expect, it } from 'vitest';
import { err, ok } from '../src/result';
import {
  checkForUpdate,
  compareVersions,
  findAvailableUpdate,
  parseLatestRelease,
  pickDownloadAsset,
  type LatestRelease,
  type ReleaseAsset,
} from '../src/updates';

const PAGE_URL = 'https://github.com/vihao1802/taking-book-desktop-app/releases/tag/v1.3.0';

// Named the way the release workflow publishes them, as GitHub serves them (spaces become dots).
const assets: ReleaseAsset[] = [
  'taking-book-desktop-app-1.3.0-full.nupkg',
  'taking-book-desktop-app-1.3.0.Setup.exe',
  'Taking.Book-darwin-arm64-1.3.0.zip',
  'taking-book-desktop_1.3.0_amd64.deb',
].map((name) => ({ name, downloadUrl: `https://example.test/${name}` }));

const release: LatestRelease = { version: '1.3.0', pageUrl: PAGE_URL, assets };

const githubJson = {
  tag_name: 'v1.3.0',
  html_url: PAGE_URL,
  assets: assets.map(({ name, downloadUrl }) => ({ name, browser_download_url: downloadUrl })),
};

describe('compareVersions', () => {
  it('orders by major, then minor, then patch, numerically', () => {
    expect(compareVersions('1.2.10', '1.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2.1', '1.2.2')).toBeLessThan(0);
  });

  it('treats a leading v as the same version', () => {
    expect(compareVersions('v1.2.2', '1.2.2')).toBe(0);
  });

  it('never ranks an unreadable version above a readable one', () => {
    expect(compareVersions('nightly', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBeGreaterThan(0);
  });
});

describe('parseLatestRelease', () => {
  it('reads the version without its v, the page and the assets', () => {
    expect(parseLatestRelease(githubJson)).toEqual(ok(release));
  });

  it('drops assets that lack a name or URL', () => {
    const json = { ...githubJson, assets: [{ name: 'a.deb' }, { browser_download_url: 'x' }, null] };
    expect(parseLatestRelease(json)).toEqual(ok({ ...release, assets: [] }));
  });

  it('rejects a response without a version tag', () => {
    expect(parseLatestRelease({ html_url: PAGE_URL }).ok).toBe(false);
    expect(parseLatestRelease({ ...githubJson, tag_name: 'latest' }).ok).toBe(false);
    expect(parseLatestRelease('not json').ok).toBe(false);
  });
});

describe('pickDownloadAsset', () => {
  it.each([
    ['win32', 'x64', 'taking-book-desktop-app-1.3.0.Setup.exe'],
    ['darwin', 'arm64', 'Taking.Book-darwin-arm64-1.3.0.zip'],
    ['linux', 'x64', 'taking-book-desktop_1.3.0_amd64.deb'],
  ])('picks the installer for %s/%s', (platform, arch, expected) => {
    expect(pickDownloadAsset(assets, platform, arch)?.name).toBe(expected);
  });

  it('accepts a Windows installer whose name still has its space', () => {
    const spaced = [{ name: 'Taking Book-1.3.0 Setup.exe', downloadUrl: 'u' }];
    expect(pickDownloadAsset(spaced, 'win32', 'x64')?.name).toBe('Taking Book-1.3.0 Setup.exe');
  });

  it('finds nothing for a CPU or OS the release does not ship', () => {
    expect(pickDownloadAsset(assets, 'darwin', 'x64')).toBeNull();
    expect(pickDownloadAsset(assets, 'linux', 'arm64')).toBeNull();
    expect(pickDownloadAsset(assets, 'freebsd', 'x64')).toBeNull();
  });
});

describe('findAvailableUpdate', () => {
  it('offers a newer release with the installer for this device', () => {
    expect(findAvailableUpdate(release, { currentVersion: '1.2.2', platform: 'linux', arch: 'x64' })).toEqual({
      version: '1.3.0',
      downloadUrl: 'https://example.test/taking-book-desktop_1.3.0_amd64.deb',
    });
  });

  it('falls back to the release page when no installer matches', () => {
    const update = findAvailableUpdate(release, { currentVersion: '1.2.2', platform: 'darwin', arch: 'x64' });
    expect(update?.downloadUrl).toBe(PAGE_URL);
  });

  it('offers nothing when the running version is the same or newer', () => {
    expect(findAvailableUpdate(release, { currentVersion: '1.3.0', platform: 'linux', arch: 'x64' })).toBeNull();
    expect(findAvailableUpdate(release, { currentVersion: '1.4.0', platform: 'linux', arch: 'x64' })).toBeNull();
  });
});

describe('checkForUpdate', () => {
  const target = { currentVersion: '1.2.2', platform: 'win32', arch: 'x64' };

  it('returns the update found in the fetched release', async () => {
    const result = await checkForUpdate({ ...target, fetchLatestRelease: async () => ok(githubJson) });
    expect(result).toEqual(ok({ version: '1.3.0', downloadUrl: 'https://example.test/taking-book-desktop-app-1.3.0.Setup.exe' }));
  });

  it('passes a fetch failure through', async () => {
    const result = await checkForUpdate({ ...target, fetchLatestRelease: async () => err('offline') });
    expect(result).toEqual(err('offline'));
  });

  it('reports an unreadable release as an error', async () => {
    const result = await checkForUpdate({ ...target, fetchLatestRelease: async () => ok({}) });
    expect(result.ok).toBe(false);
  });
});
