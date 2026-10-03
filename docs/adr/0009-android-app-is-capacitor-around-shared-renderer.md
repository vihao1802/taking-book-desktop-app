# ADR-0009: The Android app is a Capacitor shell around a shared React renderer

Status: accepted. The Reader prototype passed on a real phone and a real tablet; the native touch-selection problem it found was solved by an own selection (Decision 6). Still unverified: the WebView on a device without Google Play, and a low-end tablet.

## Context

`packages/mobile` was an empty stub, and `AGENTS.md` assumed React Native. The Android effort (free, sideloaded APK; v1 = Reader + Library + Sync; tablet first-class) hinges on the PDF engine. Research found that Reflow mode needs positioned text and the operator list from pdf.js (`reflow.ts`, `textColors.ts`); native `PdfRenderer`, `androidx.pdf` and the React Native PDF libraries do not provide them, and MuPDF is AGPL. So pdf.js inside a WebView is the engine for both Page mode and Reflow mode, whatever the shell.

The desktop renderer (about 4,200 lines of React DOM in the reader alone, with Radix and the pdf.js `TextLayer`) talks to the main process only through the typed `ReaderApi` interface. A React Native shell would keep one WebView for the Reader and need a second, native UI for everything else.

## Decision

1. The Android app is a **Capacitor** shell. The whole UI is the React renderer; pdf.js runs in the WebView for both reader modes.
2. The renderer and the `ReaderApi` interface move into a new **`packages/renderer`**. `packages/desktop` (Electron main/preload) and `packages/mobile` (Capacitor shell) are thin platform glue that import it; they still never import each other.
3. On Android there is no Node main process. `/core` runs directly in the WebView as TypeScript: SQLite through `@capacitor-community/sqlite` implementing `SqlDriver` (with a write mutex around `transaction`, since the driver does not serialize concurrent queries), files through Capacitor Filesystem, and Kotlin plugins only where the platform forces it (for example the share intent). Importing a Book copies it into app-private storage while streaming it through the core hasher; content URIs are never persisted.
4. Features the platform lacks (Quiz, Focus timer, Ambient sound, Statistics, Updates, Drop import in v1 mobile) are hidden by **capability flags** declared on `ReaderApi`, not by separate entry points.
5. Minimum Android is 10 (API 29), so the WebView is recent enough for pdf.js.
6. **Touch text selection is our own, not the WebView's.** Dragging a native selection handle into empty space (for example beside a short last line or into the margin) snaps the selection end to the end of the whole text layer, because the pdf.js spans are absolutely positioned; pdf.js's own text-layer builder did not fix it. The caret under a finger is instead computed from span geometry (the nearest line by vertical distance, the nearest span by horizontal distance, then a binary search over characters) and restricted to the page the selection started on. The selection ends when its page is unloaded by the windowed renderer. The full behaviour (teardrop handles, magnifier, toolbar that slides up after the finger lifts, page limit, auto-scroll only on a page taller than the screen) is specified in the spec for the Android app. Desktop keeps its native mouse selection.

## Exit criteria

Reopen this decision if touch text selection over the pdf.js text layer cannot be made reliable, or a large PDF cannot be browsed within the memory of a mid-range tablet. The fallback is a React Native shell hosting the Reader in a WebView (which has the same text-layer problem, so it would not have helped selection). Both criteria were checked on real devices and held; see Prototype result.

## Prototype result

A throwaway pdf.js-in-Capacitor reader (branch `prototype/android-reader`) was run on Android 15 emulators and on the reader's real phone, with a 491-page, 4.2 MB book.

- **Passed on a real phone:** scrolling the long book was smooth on a mid-range-or-better phone; only a handful of pages are rendered at once (heap about 10 MB on the emulators). Touch selection works: long-press selects a word, our toolbar sits below the native handles, tapping it keeps the selection and Highlight paints it, and no native context menu appears.
- **Real tablet (Lenovo Idea Tab, Android 16):** scrolling the long book was smooth and without jank, and rotating between portrait and landscape worked. Opening the demo sidebar left the page shifted to one side and partly covered, because the prototype does not re-fit pages to the new width.
- **Native selection handles were unreliable on both devices.** On the phone, dragging the start handle up across a 5-6 line passage made it jump to the left edge of the PDF. On the tablet, dragging a handle up often made it jump back down, and dragging it down slid it down a stretch too far. Long-press selecting a word, our toolbar and Highlight worked.
- **Cause and measurements.** An emulator harness (long-press a word, find the handles in a screenshot, drag them with `adb`, read the selection range from the console log) reproduced it: dragging a handle into empty space makes the WebView snap the selection end to the end of the whole text layer. The native selection landed on the expected lines 3 of 6 times when dragging down or up and 0 of 4 when dragging into the margins; pdf.js's own text-layer builder (with its Chromium workaround) did no better. An own selection landed 8 of 8 and 4 of 4, and also passed the page-limit and handle-crossing checks.
- **Reader's verdict:** after iterating on WPS-style behaviour with the reader (page limit, teardrop handles, magnifier, toolbar after release, selection kept while scrolling and ended only by a tap or when its page is unloaded), the reader tested the own selection on real devices and confirmed it works well.
- **Not yet verified:** the real WebView version on a device without Google Play, smoothness on a low-end tablet, auto-scroll on a zoomed page (the prototype has no zoom), and a selection across page unloading beyond ending it.
- Found by the prototype and handled outside this ADR: a landscape phone counts as the expanded size class by width alone, and pages must re-fit on resize.

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
