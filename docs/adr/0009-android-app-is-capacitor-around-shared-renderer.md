# ADR-0009: The Android app is a Capacitor shell around a shared React renderer

Status: provisional — to be confirmed or reopened by the Reader prototype on a real phone and tablet.

## Context

`packages/mobile` was an empty stub, and `AGENTS.md` assumed React Native. The Android effort (free, sideloaded APK; v1 = Reader + Library + Sync; tablet first-class) hinges on the PDF engine. Research found that Reflow mode needs positioned text and the operator list from pdf.js (`reflow.ts`, `textColors.ts`); native `PdfRenderer`, `androidx.pdf` and the React Native PDF libraries do not provide them, and MuPDF is AGPL. So pdf.js inside a WebView is the engine for both Page mode and Reflow mode, whatever the shell.

The desktop renderer (about 4,200 lines of React DOM in the reader alone, with Radix and the pdf.js `TextLayer`) talks to the main process only through the typed `ReaderApi` interface. A React Native shell would keep one WebView for the Reader and need a second, native UI for everything else.

## Decision

1. The Android app is a **Capacitor** shell. The whole UI is the React renderer; pdf.js runs in the WebView for both reader modes.
2. The renderer and the `ReaderApi` interface move into a new **`packages/renderer`**. `packages/desktop` (Electron main/preload) and `packages/mobile` (Capacitor shell) are thin platform glue that import it; they still never import each other.
3. On Android there is no Node main process. `/core` runs directly in the WebView as TypeScript: SQLite through `@capacitor-community/sqlite` implementing `SqlDriver` (with a write mutex around `transaction`, since the driver does not serialize concurrent queries), files through Capacitor Filesystem, and Kotlin plugins only where the platform forces it (for example the share intent). Importing a Book copies it into app-private storage while streaming it through the core hasher; content URIs are never persisted.
4. Features the platform lacks (Quiz, Focus timer, Ambient sound, Statistics, Updates, Drop import in v1 mobile) are hidden by **capability flags** declared on `ReaderApi`, not by separate entry points.
5. Minimum Android is 10 (API 29), so the WebView is recent enough for pdf.js.

## Exit criteria

Reopen this decision if the Reader prototype shows touch text selection over the pdf.js text layer is unusable, or a large PDF cannot be browsed within the memory of a mid-range tablet. The fallback is a React Native shell hosting the Reader in a WebView.

## Consequences

- Most desktop reader code is reused, and tablet support comes from making the shared renderer responsive rather than writing a second UI.
- The renderer must stop assuming Electron: platform differences go behind `ReaderApi` and its capability flags.
- Moving the renderer out of `packages/desktop` is a large mechanical change and touches the structure rules in `AGENTS.md`.
- The UI feels less native than React Native screens would, and WebView performance on low-end devices is unmeasured.
- Mobile can use Vitest like the other packages, since the renderer and core are plain TypeScript.

## Alternatives considered

- **React Native with the Reader in a WebView.** Matches the old `AGENTS.md`, but duplicates every non-reader screen in a second UI toolkit. Kept as the fallback.
- **Tauri mobile.** Same reuse as Capacitor, but its mobile support is young and adds a Rust toolchain.
- **Native PDF libraries (React Native or Kotlin).** Cannot feed Reflow mode; ruled out by the PDF research.
