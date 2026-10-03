# ADR-0010: Every platform signs in to Google Drive with one device-flow client, and Android syncs only while the app is open

Status: accepted. Decision 1 was revised after the shared-folder check came back negative (see Verified result and Decision 1).

## Context

Desktop signs in to Google Drive with a loopback redirect and `drive.file`, keeping Books in a `Taking Book/` folder (ADR-0004 and ADR-0007 keep the project free of paid infrastructure). Research found that Google does not support custom URI schemes on Android and treats loopback as deprecated for Android client types. The alternatives left were App Links (needs a verified HTTPS domain, an `assetlinks.json`, a Kotlin plugin, and nothing documents that verification works for sideloaded apps) and Play services' `AuthorizationClient` (no refresh token without a backend, and absent on devices without Play services).

Google's OAuth 2.0 device flow needs no redirect and no Play services, allows `drive.file` and `drive.appdata`, always returns refresh tokens, and requires a client of type "TVs and Limited Input devices" whose `client_secret` is sent when polling (desktop already ships a client secret the same way).

Core sync (`syncLibrary`) merges a manifest of records and then eagerly copies every missing PDF, reading each file whole into memory. Android has no scheduled-timer guarantee for a WebView in the background, and background work would need a Kotlin plugin.

## Decision

1. **Sign-in and the Drive folder are shared by every platform through one OAuth client.** Desktop and Android both sign in with the device flow, using a single OAuth client of type "TVs and Limited Input devices" in the Cloud project, scope `drive.file` (plus `openid`, `email`, `profile`). The flow is written once in TypeScript in `/core`, so it replaces the desktop's loopback flow (`googleDrive.ts` loopback code and `oauthLandingPage.ts` are removed). The app shows the short code, copies it to the clipboard and opens the verification page; the reader pastes it, signs in and approves. Because the same client creates and reads the `Taking Book/` folder on every platform, they share one library.
2. **Sync runs only while the app is open**: at launch, on returning to the app, on a manual sync, and every 30 minutes while open. There is no background service in v1.
3. **PDFs follow desktop (all are downloaded)**, with limits that suit a phone: the manifest (the Library, Last-read positions, Annotations) syncs on any network, while PDFs are downloaded only on Wi-Fi unless the reader turns on "Download PDFs over mobile data" in Settings (a device-local setting, never synced). Downloading stops when free storage falls under 500 MB, with a clear message. A PDF above a size threshold (about 150 MB) is never downloaded to the phone, because the sync interface reads whole files into memory; it is reported with a warning.
4. A Book whose PDF is not on the device for any of these reasons is a **Remote-only Book** (see `CONTEXT.md`).
5. Device-local on mobile, as on desktop: Reading sessions, covers, the reflow cache and settings. Conflicts stay last-write-wins per record.

## Verified result: the folder is not shared across OAuth clients

On 2026-10-03 the device flow was run with a new client of type "TVs and Limited Input devices" (scope `drive.file`, signed in as the same Google account the desktop syncs with). The device flow itself worked and issued a refresh token, but the `Taking Book` folder created by the desktop's client was **not visible** to the new client: zero folders found, while the folder was confirmed to exist in that account's Drive. So under `drive.file`, a folder is visible only to the OAuth client that created it. (The new client was created in the desktop client's Cloud project, as instructed; if it was in another project that would be a different cause, but the effect for us is the same.)

This means Android cannot read the folder the existing desktop clients use, which is why Decision 1 makes desktop switch to the same client.

## Migration of existing desktop installs

Only the owner's machines have used Drive sync so far. After the update, the stored token belongs to the old (Desktop-type) client and no longer works, so the app shows a one-time "Reconnect Google Drive" notice. The first machine that reconnects uploads the whole library to a new `Taking Book/` folder created by the new client; because the app is local-first, nothing is lost. Other machines that reconnect merge through the manifest, and PDFs are matched by content hash so nothing is duplicated. The old folder stays in Drive, invisible to the new client; the owner renames it (for example "Taking Book (old)") and deletes it once every machine has moved. The `TB_GDRIVE_CLIENT_ID` and `TB_GDRIVE_CLIENT_SECRET` repository secrets get the new client's values (same names). The old Desktop client stays in the Cloud project until every machine has updated, and is then deleted. The release notes say that a one-time reconnect is needed; a machine that has not updated keeps syncing with the old folder and will not sync with the updated ones.

## Consequences

- No domain, no Play services, no Kotlin for sign-in, and tokens (with refresh) stay in the WebView, to be stored through the platform's secure storage.
- The sign-in is a bit clunkier than desktop's one-click loopback: the reader pastes a code in a browser, but only when connecting or reconnecting, not on every sync.
- The client secret ships inside the app builds, as desktop's already does.
- Desktop gives up loopback, so its Google sign-in code shrinks; `CloudProvider.connect()` needs a way to show the code mid-flow.
- A reader's phone may lag behind desktop when the app has been closed for a long time; opening the app catches it up.
- Large books can be read only on desktop until sync supports streaming transfers; revisit that if it bites.
- The database start-up order (schemas, then migrations) lives in desktop's `db.ts` today and must move into `/core` so mobile does not duplicate it.

## Alternatives considered

- **A separate folder per client (desktop keeps loopback):** keeps desktop's one-click sign-in, but desktop and Android would never sync with each other.
- **`drive.appdata`, Google Picker, or the restricted `drive` scope:** unverified across clients, heavier, or needing Google verification respectively; none is better than one shared client.
- **App Links via a `github.io` `assetlinks.json`:** smoother, but needs a Kotlin plugin and has no documented support for sideloaded apps.
- **Play services `AuthorizationClient`:** about one-hour access tokens only, and absent without Play services.
- **Background sync with WorkManager:** works with the app closed, but needs Kotlin and is low value for a reading app.
- **Metadata first, PDFs on demand:** friendlier to phone storage and data, but the reader chose desktop-like behaviour with Wi-Fi and size guards.
- **Streaming transfers in `SyncStorage` now:** the durable fix for big files, but a core change that touches desktop and the Drive provider.
