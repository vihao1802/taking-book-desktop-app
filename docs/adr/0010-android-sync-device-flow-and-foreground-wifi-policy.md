# ADR-0010: Android signs in to Google Drive with the device flow and syncs only while the app is open

Status: accepted for the device flow and the sync policy; the shared-folder question was answered NO (see Verified result) and a follow-up decision is open.

## Context

Desktop signs in to Google Drive with a loopback redirect and `drive.file`, keeping Books in a `Taking Book/` folder (ADR-0004 and ADR-0007 keep the project free of paid infrastructure). Research found that Google does not support custom URI schemes on Android and treats loopback as deprecated for Android client types. The alternatives left were App Links (needs a verified HTTPS domain, an `assetlinks.json`, a Kotlin plugin, and nothing documents that verification works for sideloaded apps) and Play services' `AuthorizationClient` (no refresh token without a backend, and absent on devices without Play services).

Google's OAuth 2.0 device flow needs no redirect and no Play services, allows `drive.file` and `drive.appdata`, always returns refresh tokens, and requires a client of type "TVs and Limited Input devices" whose `client_secret` is sent when polling (desktop already ships a client secret the same way).

Core sync (`syncLibrary`) merges a manifest of records and then eagerly copies every missing PDF, reading each file whole into memory. Android has no scheduled-timer guarantee for a WebView in the background, and background work would need a Kotlin plugin.

## Decision

1. **Sign-in** uses the device flow, written in TypeScript in the WebView: the app shows a short code and a link, the reader opens the link (on this phone or any device) and approves. Scope stays `drive.file`. This needs a second OAuth client of type "TVs and Limited Input devices" in the same Cloud project.
2. **Sync runs only while the app is open**: at launch, on returning to the app, on a manual sync, and every 30 minutes while open. There is no background service in v1.
3. **PDFs follow desktop (all are downloaded)**, with limits that suit a phone: the manifest (the Library, Last-read positions, Annotations) syncs on any network, while PDFs are downloaded only on Wi-Fi unless the reader turns on "Download PDFs over mobile data" in Settings (a device-local setting, never synced). Downloading stops when free storage falls under 500 MB, with a clear message. A PDF above a size threshold (about 150 MB) is never downloaded to the phone, because the sync interface reads whole files into memory; it is reported with a warning.
4. A Book whose PDF is not on the device for any of these reasons is a **Remote-only Book** (see `CONTEXT.md`).
5. Device-local on mobile, as on desktop: Reading sessions, covers, the reflow cache and settings. Conflicts stay last-write-wins per record.

## Verified result: the folder is not shared across OAuth clients

On 2026-10-03 the device flow was run with a new client of type "TVs and Limited Input devices" (scope `drive.file`, signed in as the same Google account the desktop syncs with). The device flow itself worked and issued a refresh token, but the `Taking Book` folder created by the desktop's client was **not visible** to the new client: zero folders found, while the folder was confirmed to exist in that account's Drive. So under `drive.file`, a folder is visible only to the OAuth client that created it. (The new client was created in the desktop client's Cloud project, as instructed; if it was in another project that would be a different cause, but the effect for us is the same.)

This means Android cannot read the folder the existing desktop clients use. Which of the options (one OAuth client for every platform, or another) to take is a separate open decision, and it affects existing desktop users.

## Consequences

- No domain, no Play services, no Kotlin for sign-in, and tokens (with refresh) stay in the WebView, to be stored through the platform's secure storage.
- The sign-in is a bit clunkier than a one-tap redirect: the reader must type a code in a browser.
- The client secret ships inside the APK, which is no weaker than desktop's.
- A reader's phone may lag behind desktop when the app has been closed for a long time; opening the app catches it up.
- Large books can be read only on desktop until sync supports streaming transfers; revisit that if it bites.
- The database start-up order (schemas, then migrations) lives in desktop's `db.ts` today and must move into `/core` so mobile does not duplicate it.

## Alternatives considered

- **App Links via a `github.io` `assetlinks.json`:** smoother, but needs a Kotlin plugin and has no documented support for sideloaded apps.
- **Play services `AuthorizationClient`:** about one-hour access tokens only, and absent without Play services.
- **Background sync with WorkManager:** works with the app closed, but needs Kotlin and is low value for a reading app.
- **Metadata first, PDFs on demand:** friendlier to phone storage and data, but the reader chose desktop-like behaviour with Wi-Fi and size guards.
- **Streaming transfers in `SyncStorage` now:** the durable fix for big files, but a core change that touches desktop and the Drive provider.
