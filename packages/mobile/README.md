# @taking-book/mobile

Capacitor shell for the Android app (ADR-0009). It mounts the shared renderer
and implements `ReaderApi`; it imports only `@taking-book/core` and
`@taking-book/renderer`. Application id `dev.takingbook.app`, minimum Android 10
(API 29), target and compile SDK 36.

## Build a debug APK

Prerequisites: JDK 21, and an Android SDK with platform 36 and build-tools.

```sh
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
npm install
npm run android:apk --workspace @taking-book/mobile
```

This builds core, bundles the renderer with Vite, runs `cap sync android`, then
Gradle `assembleDebug`. The APK is at
`packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

## Run on an emulator

```sh
adb install -r packages/mobile/android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n dev.takingbook.app/.MainActivity
```

On a machine without a GPU, start the emulator with
`emulator -avd <name> -no-window -gpu swiftshader_indirect`.

## Icons

`assets/icon.png` and `assets/adaptive-icon.png` are the canonical 1024px icons
from the designer's pack. The generated launcher icons under `android/` are still
Capacitor's defaults.

## Data

The app database is `taking-bookSQLite.db` in the app's private storage, opened
through `@capacitor-community/sqlite`. `createCapacitorSqlDriver` implements
core's `SqlDriver` over it with a write mutex, and runs the same transaction
tests as the desktop driver (`describeSqlDriverContract`). Covers and reflow
text are files under the app's private data directory.

## Google Drive sync

The Android app signs in to Google with the OAuth device flow (ADR-0010): connecting
shows a code, copies it to the clipboard and opens the verification page, and the
reader pastes it and approves. The sign-in is kept in the platform's secure storage
(`@aparajita/capacitor-secure-storage`, backed by the Android keystore), never in the
app database. Requests to Google go through Capacitor's native HTTP plugin, so they
do not depend on the WebView's CORS rules.

The OAuth client (type "TVs and Limited Input devices", the same one desktop uses) is baked
into the web bundle at build time. Set `VITE_TB_GDRIVE_CLIENT_ID` and
`VITE_TB_GDRIVE_CLIENT_SECRET` (for example in `packages/mobile/.env`, which is
gitignored) before `npm run android:apk`; CI takes them from the `TB_GDRIVE_CLIENT_ID` and
`TB_GDRIVE_CLIENT_SECRET` secrets. Without them the Connect button reports that sync is not
set up in this build.

## Check the database driver on a device

The driver's transaction tests also run against the real plugin. With an
emulator or device attached:

```sh
npm run android:device-check --workspace @taking-book/mobile
```

It builds a debug APK with `VITE_TB_DEVICE_CHECK` set, installs and starts it,
and prints one `TB_DEVICE_CHECK` line per test from logcat (exit code 1 if any
fails). The check uses its own database, not the reader's, and the script
rebuilds the normal web bundle afterwards; run `android:apk` to put the normal
app back on the device.
