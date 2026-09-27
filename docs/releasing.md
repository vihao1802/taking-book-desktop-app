# Releasing

End users download the app from the **GitHub Releases** page of this repo. A
tagged release triggers a GitHub Actions workflow
(`.github/workflows/release.yml`) that builds a `.deb` (Linux) and a `.exe`
(Windows) and attaches them to the release.

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

   The workflow builds both platforms and publishes the release notes
   automatically from the commits since the last tag.
3. Verify the release at `https://github.com/vihao1802/taking-book-desktop-app/releases`.

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
- Install the Linux package with `sudo apt install ./taking-book-desktop-app_*.deb`.
