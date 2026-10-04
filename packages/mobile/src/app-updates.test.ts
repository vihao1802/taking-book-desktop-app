import { err, ok, type Result } from '@taking-book/core';
import { describe, expect, it, vi } from 'vitest';
import { createAppUpdates } from './app-updates';

const RELEASE_PAGE = 'https://github.com/vihao1802/taking-book-desktop-app/releases/tag/v1.3.0';
const APK_URL = 'https://github.com/vihao1802/taking-book-desktop-app/releases/download/v1.3.0/taking-book-1.3.0.apk';

function releaseJson(assetNames: string[]): unknown {
  return {
    tag_name: 'v1.3.0',
    html_url: RELEASE_PAGE,
    assets: assetNames.map((name) => ({
      name,
      browser_download_url: `https://github.com/vihao1802/taking-book-desktop-app/releases/download/v1.3.0/${name}`,
    })),
  };
}

function setup(json: Result<unknown>, version = '1.2.0') {
  const openUrl = vi.fn(async (): Promise<Result<void>> => ok(undefined));
  const updates = createAppUpdates({
    getAppVersion: async () => version,
    fetchLatestRelease: async () => json,
    openUrl,
    log: () => undefined,
  });
  return { updates, openUrl };
}

describe('createAppUpdates', () => {
  it('offers the APK from the latest release', async () => {
    const { updates } = setup(ok(releaseJson(['taking-book-desktop_1.3.0_amd64.deb', 'taking-book-1.3.0.apk'])));
    expect(await updates.checkForUpdate()).toEqual(ok({ version: '1.3.0', downloadUrl: APK_URL }));
  });

  it('falls back to the release page when the release has no APK', async () => {
    const { updates } = setup(ok(releaseJson(['taking-book-desktop_1.3.0_amd64.deb'])));
    expect(await updates.checkForUpdate()).toEqual(ok({ version: '1.3.0', downloadUrl: RELEASE_PAGE }));
  });

  it('offers nothing when the app is already current', async () => {
    const { updates } = setup(ok(releaseJson(['taking-book-1.3.0.apk'])), '1.3.0');
    expect(await updates.checkForUpdate()).toEqual(ok(null));
  });

  it('passes a failed fetch through so no notice is shown', async () => {
    const { updates } = setup(err('offline'));
    expect(await updates.checkForUpdate()).toEqual(err('offline'));
  });

  it('reports an error instead of throwing when the app version cannot be read', async () => {
    const updates = createAppUpdates({
      getAppVersion: async () => {
        throw new Error('no plugin');
      },
      fetchLatestRelease: async () => ok(releaseJson(['taking-book-1.3.0.apk'])),
      openUrl: async () => ok(undefined),
      log: () => undefined,
    });
    expect((await updates.checkForUpdate()).ok).toBe(false);
    expect((await updates.getAppVersion()).ok).toBe(false);
  });

  it('opens a release download in the browser',async () => {
    const { updates, openUrl } = setup(ok(null));
    expect(await updates.openUpdateDownload(APK_URL)).toEqual(ok(undefined));
    expect(openUrl).toHaveBeenCalledWith(APK_URL);
  });

  it('refuses to open a link outside this app’s releases', async () => {
    const { updates, openUrl } = setup(ok(null));
    expect((await updates.openUpdateDownload('https://evil.test/x.apk')).ok).toBe(false);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens the Releases page in the browser', async () => {
    const { updates, openUrl } = setup(ok(null));
    await updates.openReleasesPage();
    expect(openUrl).toHaveBeenCalledWith('https://github.com/vihao1802/taking-book-desktop-app/releases');
  });

  it('reports the installed app version', async () => {
    const { updates } = setup(ok(null), '1.2.0');
    expect(await updates.getAppVersion()).toEqual(ok('1.2.0'));
  });
});
