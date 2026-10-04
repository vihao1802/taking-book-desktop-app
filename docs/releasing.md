# Releasing

End users download the app from the **GitHub Releases** page of this (public)
repo. A tag pushed here triggers a GitHub Actions workflow
(`.github/workflows/release.yml`) that builds a `.deb` (Linux), a `.exe`
(Windows), a `.zip` (macOS) and a signed Android `.apk` and attaches them to the release. The app's
update notice reads the same Releases page, so readers are told about the new
version on their next launch.

## Cutting a release

Follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **PATCH** — bug fixes and backwards-compatible small changes (`1.2.3` → `1.2.4`).
- **MINOR** — new backwards-compatible features (`1.2.3` → `1.3.0`).
- **MAJOR** — breaking changes (`1.2.3` → `2.0.0`).

Steps:

1. Bump the version in `packages/desktop/package.json` and commit.
2. Push a tag named `v<version>` (matching the `package.json` version):

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   The workflow builds all three platforms and publishes the release.
3. Verify the release at `https://github.com/vihao1802/taking-book-desktop-app/releases`.

## Android APK

The `android` job builds `taking-book-<version>.apk` from the same tag (ADR-0011).
`versionCode` is `major*10000 + minor*100 + patch`, so minor and patch must stay
at or below 99. The tag must equal the version in `packages/desktop/package.json`.
A manual run builds the APK without publishing; without the signing secrets it
produces `taking-book-<version>-unsigned.apk`, while a tag push fails instead of
publishing an unsigned build.

Repository secrets (the keystore itself is never committed):

- `TB_ANDROID_KEYSTORE_BASE64`: the PKCS12 keystore, `base64 -w0 release.p12`.
- `TB_ANDROID_KEYSTORE_PASSWORD`: its password (also used for the key).
- `TB_ANDROID_KEY_ALIAS`: the key alias.

The workflow decodes the keystore to a runner temp file and deletes it after the
build, then prints the APK's signing certificate; compare its SHA-256 with the
one registered in the Android Developer Console.

## Notes

- **Google OAuth credentials** are injected from the `TB_GDRIVE_CLIENT_ID` /
  `TB_GDRIVE_CLIENT_SECRET` repository secrets at build time. Set them in the
  repo's *Settings → Secrets*; the publisher's (verified) client is used for
  end users. Without them the app builds but cloud sync is disabled.
- **Windows build** (Squirrel `.exe`) is unsigned — SmartScreen will warn users
  "Unknown publisher". Signing needs a code-signing certificate; see
  `.github/workflows/release.yml` if that becomes necessary.
- **macOS**: the workflow builds an unsigned, un-notarized `.zip` on `macos-latest`
  (Apple Silicon only). Users must right-click the app and choose Open the first
  time. A signed `.dmg` and an Intel build need an Apple Developer account and
  are not wired up.
- Install the Linux package with `cp taking-book-desktop_*.deb /tmp/ && sudo apt install /tmp/taking-book-desktop_*.deb`.
