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
