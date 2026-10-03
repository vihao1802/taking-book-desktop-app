# Free sideloaded Android APK: signing, Play Protect, CI build, update check

Research date: 2026-10-03. Answers issue #50 (map #48). Constraint: free only, self-signed APK from GitHub Releases, no Play Store. Every claim cites the page it was read from; items I could not confirm from a primary source are listed under "Gaps".

## Short answer

1. A self-signed keystore is all Android needs to install an APK. Its one hard rule: the key never changes for the life of the app, and losing it means no more updates for existing installs (users must uninstall and reinstall).
2. Play Protect does not block sideloaded apps outright; for an app Google has never seen it recommends an opt-in scan. The bigger risk is **Android developer verification** (see section 2), which reaches sideloaded apps globally from 2027.
3. Sideloading is not exempt from the minimum `targetSdk`: Android 15 refuses installs targeting below API 24. Any current React Native / Expo target is far above that, so this is a non-issue in practice.
4. A GitHub Actions job can build, sign (keystore as a base64 secret) and attach the APK to the same release as the desktop assets.
5. The existing update check can point at the APK with a small `pickDownloadAsset` branch for `android`, opening the browser (consistent with ADR-0008).

## 1. Signing keystore

- All APKs must be signed before install or update: "Android requires that all APKs be digitally signed with a certificate before they are installed on a device or updated." ([App signing](https://developer.android.com/studio/publish/app-signing))
- Key never changes: "the signing key never changes during the lifetime of your app." Loss: "If you lose your app's signing key, you lose the ability to update your app." and "You cannot regenerate a previously generated key." (same page)
- Play App Signing, which lets Google hold the key and allows an "upload key reset", only exists on Google Play, so it does not help a GitHub-only release. Custody is entirely ours. (same page)
- Custody advice from the docs: strong keystore and key passwords, never share the key, keep the keystore somewhere safe. (same page)
- Validity: the page says keys for Play must be valid past 22 October 2033 and recommends 25 years or more. Not required for sideloading, but cheap to follow (use 10000 days).
- Rotation exists (APK Signature Scheme v3 lineage): `apksigner rotate --in lineage --out new-lineage --old-signer --ks old.jks --new-signer --ks new.jks`, then `apksigner sign --ks release.jks --next-signer --ks release2.jks --lineage lineage app.apk --rotation-min-sdk-version 28`. `--rotation-min-sdk-version` is "the lowest API level the APK's rotated signing key should use"; the original key signs for earlier platform versions. ([apksigner](https://developer.android.com/tools/apksigner)) A lineage is the only way to change keys without breaking updates, and it needs the **old** key, so it does not rescue a lost key.
- Lost-key consequence for us: new APKs would be rejected as updates over an installed copy; readers must uninstall first, which deletes app data. Mitigation: Drive sync holds the library state, and keep two offline copies of the keystore plus passwords in a password manager.

## 2. Play Protect and "install unknown apps"

- Play Protect checks apps regardless of source: "no matter where you download an app from, you know it's been checked by Google Play Protect." ([Play Protect](https://developers.google.com/android/play-protect))
- For an app never scanned: "You may get a recommendation to scan an app from outside of Google Play that has never been scanned by Google Play Protect before." Scanning "will send app details to Google for a code-level evaluation", then the user is told whether it looks safe. Users can disable some protections in settings. ([Play Protect help](https://support.google.com/googleplay/answer/2812853)) Expect a scan recommendation on first install of an unknown APK; it is a prompt, not a block.
- Install-unknown-apps permission: the user must allow the app that opened the APK (browser or file manager) to install apps (Android 8+ per-app model). I could not load a primary page for the exact settings path (see Gaps). Release notes should describe the steps in plain words.
- **Developer verification (the real 2026 risk).** Per [developer.android.com/developer-verification](https://developer.android.com/developer-verification): API and accounts launch August 2026; enforcement starts 30 September 2026 for apps from participating stores in Brazil, Indonesia, Singapore and Thailand on certified devices running Android 7+; "2027 and beyond" it expands globally to all apps on certified devices. Apps distributed outside Play (sideload, GitHub) are in scope. Registration needs package name + signing key. Account types: standard (government ID, fee), **limited distribution** (no ID, free, up to 20 devices, for students/hobbyists), and a registration route for open source apps. A "power user advanced flow" lets users install unverified apps. Consequence: from 2027 an unverified, self-signed APK will need that advanced flow (or ADB) on certified devices. Decision for the spec: register package name + signing key before the global rollout, and tell readers about the advanced flow as a fallback. Re-read the page before the spec; dates are still moving.

## 3. targetSdk rules that affect sideloading

- Android 14: apps with `targetSdkVersion` below 23 cannot be installed. ([Android 14 behavior changes](https://developer.android.com/about/versions/14/behavior-changes-all))
- Android 15: below 24 cannot be installed; existing installs survive an OS upgrade. Error is `INSTALL_FAILED_DEPRECATED_SDK_VERSION`. The only bypass is `adb install --bypass-low-target-sdk-block`. ([Android 15 behavior changes](https://developer.android.com/about/versions/15/behavior-changes-all))
- Google Play's yearly "target latest API" rule applies only to Play publishing, so it does not bind us. Still, target the framework's current default API level.
- Developer verification (above) covers Android 7+ (API 24), so `minSdk` 24 is a natural floor.

## 4. Building and releasing in GitHub Actions

Existing setup (`.github/workflows/release.yml`, `docs/releasing.md`): a `v*` tag runs a 3-OS `build` matrix, uploads artifacts, then a tag-gated `release` job downloads them with `merge-multiple` and publishes with `softprops/action-gh-release@v2` using `files: artifacts/**/*.{exe,nupkg,blockmap,deb,zip}`. Unsigned distribution is already accepted for desktop (ADR-0008).

Plan for Android:
- Add an `android` build job (ubuntu, JDK 17, Android SDK) that produces a release APK and uploads it as artifact `make-android`. Add `apk` to the release `files` glob. The release job already merges all artifacts, so nothing else changes.
- Keystore as a secret: GitHub documents storing binary files as base64 secrets (`base64 -w 0`, then `echo $SECRET | base64 --decode > file`), with a 48 KB limit and the warning that base64 "is not a substitute for actual encryption". Add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. "With the exception of `GITHUB_TOKEN`, secrets are not passed to the runner when a workflow is triggered from a forked repository", which fits our tag-only trigger. ([GitHub secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions))
- Sign with Gradle `signingConfigs` reading env vars, or `zipalign` + `apksigner sign`, then `apksigner verify` ([apksigner](https://developer.android.com/tools/apksigner)). Delete the decoded keystore after the step.
- `versionCode` must increase on every release or Android will refuse the update; derive it from the same version as `packages/desktop/package.json` (for example `major*10000 + minor*100 + patch`) so tag, desktop and APK agree.
- Use a stable, matchable asset name such as `taking-book-<version>.apk`.
- Keep `workflow_dispatch` as a verify-only run: build, publish only on tags, as today.

## 5. In-app update check pointing at the APK

- `packages/core/src/updates.ts` already reads GitHub's `releases/latest`, and `pickDownloadAsset(assets, platform, arch)` matches by file name. Add an `android` branch matching `.apk`; `findAvailableUpdate` already falls back to the release page when nothing matches. "Latest" is "the most recent non-prerelease, non-draft release" ([GitHub REST](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)), so desktop and APK in one release share a version and the check works unchanged.
- `compareVersions` handles only `major.minor.patch`, fine if the APK `versionName` uses the same scheme.
- Install handoff stays out of scope (map, ADR-0008): open the APK URL or release page in the system browser. An in-app installer would also need `REQUEST_INSTALL_PACKAGES` and a FileProvider.
- "Download newer APK and tap Install" works only because the signing key matches, which is why section 1 matters.

## Decisions this suggests for the spec

1. Generate one 25-year keystore, back it up twice offline, store it as a base64 repo secret; no Play App Signing.
2. Treat developer verification as a release-gating item before the 2027 global rollout: register package name + signing key (limited distribution or open-source route) and document the advanced flow.
3. Add an `android` CI job plus `apk` in the release glob; derive `versionCode` from the tag version.
4. Extend `pickDownloadAsset` for `android`; the update check opens the browser.
5. Target the current framework default API level; no targetSdk workaround needed.

## Gaps (not confirmed from a primary source)

- The exact "Install unknown apps" settings path and the `REQUEST_INSTALL_PACKAGES` reference text: the reference page did not render and the support URL returned 404.
- Whether the Play Protect scan prompt appears on every update, and its exact wording: the first-party help page says only "recommendation to scan"; the "App scan recommended" wording is from press coverage ([9to5Google](https://9to5google.com/2023/10/18/google-play-protect-scan/)).
- The `versionCode` must-increase rule is standard Android behaviour, but the doc line was not fetched.
- Developer verification details come from one first-party summary page; fees, exact limited-distribution terms and advanced-flow friction need checking when the spec is written.
