// Derives the Android version fields from a release tag (ADR-0011), so the APK
// shares the desktop version and `versionCode` always grows with the tag.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const MAX_PART = 99;

/**
 * Turns a `v<major>.<minor>.<patch>` tag into the APK's version fields.
 * versionCode is major*10000 + minor*100 + patch; minor and patch are capped
 * at 99 because a larger value would collide with the next digit group.
 *
 * @param {string} tag release tag, e.g. "v1.4.2"
 * @returns {{ versionName: string, versionCode: number }}
 */
export function deriveAndroidVersion(tag) {
  const match = TAG_PATTERN.exec(tag);
  if (!match) {
    throw new Error(`Tag "${tag}" is not of the form v<major>.<minor>.<patch>.`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > MAX_PART || patch > MAX_PART) {
    throw new Error(`Tag "${tag}": minor and patch must be at most ${MAX_PART} for versionCode.`);
  }
  return { versionName: `${major}.${minor}.${patch}`, versionCode: major * 10000 + minor * 100 + patch };
}

// CLI: `node derive-android-version.mjs v1.4.2` prints key=value lines and, on
// GitHub Actions, appends them to $GITHUB_OUTPUT.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { versionName, versionCode } = deriveAndroidVersion(process.argv[2] ?? '');
    const lines = `versionName=${versionName}\nversionCode=${versionCode}\n`;
    process.stdout.write(lines);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
