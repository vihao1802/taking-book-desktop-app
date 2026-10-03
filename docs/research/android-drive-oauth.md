# Google Drive OAuth (PKCE) from a sideloaded Android app

Research for issue #51 (map #48). Sources are first-party Google / Android docs, fetched 2026-10-03. Claims the docs do **not** answer are marked **UNVERIFIED**.

## Current desktop design (grounding)

- `packages/core/src/sync/pkce.ts` is platform-agnostic: verifier from an injected `randomBytes`, S256 challenge via pure core SHA-256. It is reusable on Android as is.
- Desktop flow (`docs/oauth-pkce-sequence.md`): Desktop-type client, loopback redirect `http://127.0.0.1:<port>`, `client_secret` sent on exchange/refresh, scope `drive.file` only, files in a `Taking Book/` Drive folder (not `appDataFolder`), tokens encrypted with Electron `safeStorage`.

## Answers

### 1. Redirect handling

- Google: "Custom URI schemes are no longer supported on Android and Chrome apps." The loopback redirect is also listed as deprecated for Android client types; the recommended redirect mechanism is App Links. [OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- So the desktop loopback server and a `takingbook://` scheme are both out for an **Android-type** client.
- App Links need a verified HTTPS domain plus `assetlinks.json` whose `sha256_cert_fingerprints` matches the signing cert; the system fetches it at install time. [Android App Links](https://developer.android.com/training/app-links/about) We have no paid domain (ADR-0004); a GitHub Pages site could host the file, but the docs say nothing about verification for sideloaded installs (**UNVERIFIED**).
- Custom Tabs are the in-app browser UI (shared cookie jar with the user's browser, preferred over WebView for external URLs), but the page does not discuss OAuth. [Custom Tabs](https://developer.android.com/develop/ui/views/layout/webapps/overview-of-android-custom-tabs) Custom Tabs are only the display layer; they still need a redirect target.
- Google's recommended path avoids redirects entirely: `AuthorizationClient` from Google Play services, with Credential Manager for sign-in only. "For authorization, use AuthorizationClient for granular authorization requests to Google Accounts (like Drive...)". [Android: identify users](https://developer.android.com/training/id-auth/identify), [AuthorizationClient](https://developer.android.com/identity/authorization) Consequence: no PKCE code on the device in that path (the Android client is identified by package + signature), and it requires Google Play services (not guaranteed on all tablets or AOSP devices; impact **UNVERIFIED**).

### 2. Android OAuth client requirements

- Package name (from `AndroidManifest.xml`) and SHA-1 of the signing certificate; for self-managed keys, take SHA-1 from `keytool`. [AuthorizationClient](https://developer.android.com/identity/authorization)
- "`client_secret` is not applicable" to Android/iOS/Chrome clients. [native-app](https://developers.google.com/identity/protocols/oauth2/native-app)
- Implication for a self-signed APK: the SHA-1 is of **our own release keystore**; it must stay stable across releases and be registered in the Cloud project, otherwise a re-signed build breaks auth. (Inference from the requirement above.)

### 3. Scope, verification, test-user limits

- `drive.file` and `drive.appdata` are both classed **non-sensitive** (basic verification only). [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- The unverified-app warning and the 100-new-user cap apply to apps requesting *sensitive or restricted* scopes before verification. [Unverified apps](https://support.google.com/cloud/answer/7454865) With only non-sensitive scopes the cap should not apply (inference).
- If the project stays in **Testing**: max 100 test users, and for external user type refresh tokens expire after **7 days** (unless only basic profile scopes). [Test users / consent](https://support.google.com/cloud/answer/15549945), [Refresh token expiry](https://developers.google.com/identity/protocols/oauth2#expiration) Publish to **In production** to avoid weekly re-login.
- Other refresh-token limits: 100 per account per client ID (oldest silently invalidated), invalid after 6 months unused or on user revoke. [same](https://developers.google.com/identity/protocols/oauth2#expiration)

### 4. Token storage

- The Android docs do not prescribe storage for tokens we hold ourselves. With `AuthorizationClient` the library caches short-lived (about 1 h) access tokens and re-authorizes silently; a refresh token is only obtained via a server auth code (`requestOfflineAccess` + `getServerAuthCode`), which implies a backend. [AuthorizationClient](https://developer.android.com/identity/authorization) We have no backend (ADR-0004), so the likely design is: no stored refresh token, call `authorize()` before each sync. If we instead run our own PKCE flow, we must store the refresh token ourselves (Android Keystore-backed storage; **recommendation, not from these sources**).

### 5. Same Drive folder as desktop?

- `drive.appdata`: hidden folder; "Only the application that created the data in the `appDataFolder` can access it." The docs do not say whether different OAuth clients (desktop vs Android) of one project share it (**UNVERIFIED**). [appDataFolder](https://developers.google.com/workspace/drive/api/guides/appdata)
- `drive.file`: access to files the app created or the user opened/shared with it. The docs do not say whether the grant is per client ID or per Cloud project (**UNVERIFIED**). [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) Desktop creates `Taking Book/` under `drive.file`; if the Android client counts as a different app, it will not see that folder.
- Switching desktop to `appdata` would orphan existing users' data, so settle this with a prototype, not an assumption.

## Open items for follow-up (feeds #56)

1. Prototype: create the folder from the Desktop client, then list it from an Android-type client in the same Cloud project with `drive.file`; repeat with `appDataFolder`.
2. If the clients cannot share, fallback: Android uses the Desktop/Web client with browser + App Link redirect (needs a domain), or a Picker-style flow.
3. Decide Play services dependency (AuthorizationClient) vs own PKCE.
