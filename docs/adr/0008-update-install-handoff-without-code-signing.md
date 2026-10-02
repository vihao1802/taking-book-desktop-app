# ADR-0008: Update installs are downloaded in-app, then handed to the OS — no silent background update

Status: accepted

## Context

The update check (`checkForUpdate` in `/packages/core`) already tells the reader when a newer release exists. Until now, clicking "Download" just opened the matching GitHub release asset in the browser (`shell.openExternal`), leaving the reader to find the downloaded file and run it themselves with no further help from the app.

True silent auto-update — Electron's `autoUpdater` backed by Squirrel.Windows and Squirrel.Mac, replacing the running app in place with no installer UI — needs signed, notarized builds. This app ships unsigned on every platform (no Windows code-signing cert, no Apple Developer ID/notarization; the release workflow calls this out explicitly for macOS), and there is no update feed server, only the GitHub Releases API. Setting up signing and a feed is a real cost with no other driver for this non-commercial, client-only app (same reasoning as ADR-0004 and ADR-0007 for avoiding backend/infra costs).

## Decision

1. The app downloads the matching release asset itself (via `net.fetch` in the main process) into a temp directory, instead of opening the browser.
2. Once downloaded, the app hands the file to the OS's own installer UI and then quits itself, rather than replacing its own files:
   - **Windows**: opens the downloaded `Setup.exe`, letting Squirrel's installer run.
   - **Linux**: opens the `.deb` with the system's package-install GUI, the same as double-clicking it in a file manager.
   - **macOS**: unzips the downloaded `.zip` and reveals the extracted `.app` in Finder for the reader to drag into Applications — there is no `.dmg`/`.pkg`, so this is as close to "install" as an unsigned zip gets.
   - When no asset matches the reader's OS/arch, the existing fallback (opening the release page in the browser) is unchanged.
3. Checking and downloading remain user-initiated (a click), not a background poll-and-fetch.

## Consequences

- Every platform still needs one manual step (approve the installer, or drag the app in Finder) — this is not a fully silent update, and a reader will still see one click/prompt per update.
- No code-signing or notarization cost, no update-feed server to run or keep available.
- Revisiting this later for true silent updates means buying a Windows signing cert and an Apple Developer ID, standing up Squirrel feeds, and is a separate, larger piece of work.
- On macOS, the downloaded `.zip` carries a quarantine flag (as any network download does) and the extracted `.app` is unsigned and unnotarized, so Gatekeeper may still refuse to open it even after it is revealed in Finder; the reader may need to right-click → Open, or clear the quarantine attribute by hand. This is not new — a browser download of the same asset hit the same wall before this change — but it is unresolved by this decision and is a candidate reason to eventually sign/notarize macOS builds.
- The app quits immediately once the macOS `.app` is revealed in Finder, not once it is actually installed (there is no installer to wait on for a `.zip`). If the reader is interrupted before dragging it into Applications, or Gatekeeper blocks the new copy, they are left with no running copy of Taking Book until they finish that step by hand.

## Alternatives considered

- **Full silent auto-update via `electron-updater`/Squirrel feeds.** Rejected for now: requires signed, notarized builds and a feed server this project doesn't have.
- **Linux as an AppImage instead of `.deb`.** Would allow `electron-updater` to patch Linux silently, but changes how the app is currently installed/distributed on Linux; left for a future decision if Linux auto-update becomes a priority on its own.
- **The app replacing its own files in `/Applications` or via `pkexec` on Linux.** Rejected: more fragile, and an unsigned app replacing itself is exactly the kind of thing Gatekeeper is designed to flag.
