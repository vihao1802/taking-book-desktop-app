import type { Result } from './result';
import { err, ok } from './result';

/** One downloadable file attached to a published release. */
export interface ReleaseAsset {
  name: string;
  downloadUrl: string;
}

/** The newest published release, as far as the update check needs it. */
export interface LatestRelease {
  version: string;
  pageUrl: string;
  assets: ReleaseAsset[];
}

/** A newer version the reader can install, with where to get it for this device. */
export interface AvailableUpdate {
  version: string;
  /** The installer for this OS and CPU, or the release page when none matches. */
  downloadUrl: string;
}

/** The device the update is for, as Node reports it (`process.platform`, `process.arch`). */
export interface UpdateTarget {
  currentVersion: string;
  platform: string;
  arch: string;
}

export interface CheckForUpdateOptions extends UpdateTarget {
  /**
   * Fetches the latest release's JSON (GitHub's `releases/latest` shape),
   * injected so core never touches the network. Must resolve, never reject.
   */
  fetchLatestRelease: () => Promise<Result<unknown>>;
}

/**
 * Asks for the latest release and reports whether it is newer than the
 * running version.
 *
 * @returns the update to offer, null when already up to date, or an error when
 *   the release could not be fetched or read.
 */
export async function checkForUpdate(options: CheckForUpdateOptions): Promise<Result<AvailableUpdate | null>> {
  const fetched = await options.fetchLatestRelease();
  if (!fetched.ok) return fetched;
  const release = parseLatestRelease(fetched.data);
  if (!release.ok) return release;
  return ok(findAvailableUpdate(release.data, options));
}

/**
 * Narrows GitHub's `releases/latest` response to what the update check uses.
 * Assets with a missing name or URL are dropped rather than failing the check.
 */
export function parseLatestRelease(json: unknown): Result<LatestRelease> {
  if (!isRecord(json)) return err('The release response is not an object.');
  const { tag_name: tagName, html_url: pageUrl, assets } = json;
  if (typeof tagName !== 'string' || parseVersion(tagName) === null) {
    return err(`The release has no usable version tag: ${String(tagName)}`);
  }
  if (typeof pageUrl !== 'string') return err('The release has no page URL.');
  const parsedAssets = Array.isArray(assets) ? assets.flatMap(parseAsset) : [];
  return ok({ version: tagName.replace(/^v/, ''), pageUrl, assets: parsedAssets });
}

/**
 * Compares the latest release with the running version.
 *
 * @returns the update to offer, or null when the release is not newer.
 */
export function findAvailableUpdate(release: LatestRelease, target: UpdateTarget): AvailableUpdate | null {
  if (compareVersions(release.version, target.currentVersion) <= 0) return null;
  const asset = pickDownloadAsset(release.assets, target.platform, target.arch);
  return { version: release.version, downloadUrl: asset?.downloadUrl ?? release.pageUrl };
}

/**
 * Picks the installer a reader on this OS and CPU should download, matching the
 * file names the release workflow publishes. GitHub turns spaces in asset names
 * into dots, so the Windows installer may end in `.Setup.exe` or ` Setup.exe`.
 *
 * @returns the matching asset, or null when the release has none for this device.
 */
export function pickDownloadAsset(assets: ReleaseAsset[], platform: string, arch: string): ReleaseAsset | null {
  const matches = assetMatcher(platform, arch);
  if (matches === null) return null;
  return assets.find((asset) => matches(asset.name)) ?? null;
}

function assetMatcher(platform: string, arch: string): ((name: string) => boolean) | null {
  if (platform === 'win32') return (name) => /[. ]Setup\.exe$/.test(name);
  if (platform === 'darwin') return (name) => name.endsWith('.zip') && name.includes(`darwin-${arch}`);
  if (platform === 'linux') {
    const debArch = arch === 'x64' ? 'amd64' : arch;
    return (name) => name.endsWith(`_${debArch}.deb`);
  }
  return null;
}

/**
 * Orders two `major.minor.patch` versions (a leading `v` is ignored). A
 * version that cannot be read sorts before any readable one, so a malformed
 * value never triggers an update.
 *
 * @returns a negative number when a is older, 0 when equal, positive when newer.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (left === null || right === null) return (left === null ? 0 : 1) - (right === null ? 0 : 1);
  for (let index = 0; index < 3; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseAsset(value: unknown): ReleaseAsset[] {
  if (!isRecord(value)) return [];
  const { name, browser_download_url: downloadUrl } = value;
  return typeof name === 'string' && typeof downloadUrl === 'string' ? [{ name, downloadUrl }] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
