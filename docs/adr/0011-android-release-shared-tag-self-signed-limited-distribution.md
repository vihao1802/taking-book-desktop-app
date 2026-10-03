# ADR-0011: The Android APK ships on the shared release tag, self-signed, and registered as limited distribution

Status: accepted (the exact limited-distribution mechanics are still to be learned; see Open question).

## Context

The Android app is free and sideloaded (ADR-0009). Its audience is the owner's own devices and a few acquaintances, at most 20 devices. Releases of the desktop app already come from one tag (`v<version>`) on GitHub Releases, built by `.github/workflows/release.yml`; the in-app update check reads the same page and only opens the browser (ADR-0008).

Research against Google's pages found:

- Android developer verification is enforced from 2026-09-30 for apps from participating stores in Brazil, Indonesia, Singapore and Thailand on certified devices (Android 7+), and expands globally in 2027. Sideloaded APKs are in scope in the end.
- An unregistered app can then be installed or updated only through the advanced flow (developer mode, a coaching check, a restart, a one-day wait, then biometric or PIN, enabling it for 7 days or indefinitely) or through ADB. If the advanced flow is off, updates to an unregistered app fail.
- Registration takes a package name and the SHA-256 of the signing key. A **Full Distribution** account costs $25 and needs a government ID. A **Limited Distribution** account is free, needs no ID, and shares an app with up to 20 specific devices. The open-source-app guide appears to concern registering an open source platform's key, and does not state terms for a self-published repo.
- A self-signed keystore is enough, but the signing key can never change: if it is lost, installed copies can no longer be updated.

## Decision

1. **One release unit.** The same `v<version>` tag builds the desktop installers and the APK, and attaches all of them to one release. The version is shared. The Android `versionCode` is derived from the tag as `major*10000 + minor*100 + patch`. The APK has a fixed name, `taking-book-<version>.apk`.
2. **Signing key.** A long-lived PKCS12 keystore is kept as a base64 repository secret so CI can sign; its password and an encrypted backup copy are kept outside GitHub, because a lost key can never be recovered. The keystore is never committed. New CI secrets: the keystore, its password, the key alias, and the client id and secret of the OAuth client of type "TVs and Limited Input devices" (ADR-0010).
3. **Developer verification.** Before the first APK is published, register the package name and the signing key's SHA-256 with the Android Developer Console as a Limited Distribution account.
4. **Updates.** The update check gets an `android` branch in `pickDownloadAsset` that picks the `.apk`; the notice opens the download URL in the browser. There is no in-app installer (ADR-0008).
5. **Install guide.** A section in the README and `docs/releasing.md` explains turning on installs from unknown sources, the Play Protect prompt, and the advanced flow; release notes carry one link to it.
6. **Build parameters.** `minSdk` 29 (ADR-0009), `targetSdk` the latest allowed.

## Open question

How the 20 specific devices are declared for a Limited Distribution account, and whether it covers updates, is not documented in the pages read. A task ticket walks through the real signup and records what it asks for. If it cannot work for the intended readers, the alternatives are paying $25 and giving an ID for Full Distribution, or telling readers to use the advanced flow or ADB.

## Consequences

- The cost stays at zero, and a release is still one `git push` of a tag.
- A fix for Android alone forces a version bump that desktop readers also see.
- The signing key becomes a permanent obligation: losing it ends updates for every installed copy.
- Past 20 devices, or if the project becomes public-facing, the registration choice must be revisited.
- The update flow still needs one tap on a browser download and one on the installer, plus the advanced flow wherever verification is enforced and the app is unregistered.

## Alternatives considered

- **A separate `android-v<version>` tag:** independent releases, but versions diverge and the update check, which reads the latest release, must filter by tag prefix.
- **Full Distribution registration ($25 and a government ID):** the way to serve an unlimited audience, but it breaks the free-only constraint.
- **Registering later, when enforcement reaches the reader's country:** postpones the work, but risks acquaintances' installs being blocked from updating with no warning.
- **In-app download and install:** more convenient, but needs a Kotlin plugin and the install permission, and ADR-0008 showed this kind of code is not worth maintaining.
- **Keystore only as a GitHub secret:** GitHub cannot show a secret again, so a deleted secret or lost repo access would lose the key for good.
