# Taking Book — Desktop Reader

The Electron desktop app for Taking Book. UI and platform glue only: all data
logic lives in [`@taking-book/core`](../core) and is imported from here.

> **Phase 2 in progress.** Phase 1 (chrome-less reader) is complete; the
> library grid view (status/tags/search) landed, and cover thumbnails are still
> on the roadmap.

## Tech stack

- **Electron + Vite + TypeScript** (Electron Forge), React 19 renderer
- **PDF rendering:** [pdf.js](https://github.com/mozilla/pdfjs-dist) — canvas
  rendering with windowed rasterization (only pages near the viewport are
  rendered). pdf.js is also the basis for the Phase 3 mobile-reflow work
  (text-layer extraction).
- **Metadata store:** [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
  in the Electron main process, wrapped in the core `SqlDriver` interface and
  exposed to the renderer only through typed IPC returning `Result` shapes.

## Architecture

```
src/
  main.ts                 Electron main process entry
  preload.ts              contextBridge API surface (window.api)
  main/
    db.ts                 SQLite connection; applies core schema; exposes SqlDriver
    sqliteDriver.ts       better-sqlite3 -> core SqlDriver adapter
    hash.ts               streams file bytes into core's pure sha256
    ipc.ts                IPC handlers (open, position, theme)
  renderer/
    App.tsx               Library <-> Reader state routing
    theme.tsx             light / dark / sepia / system theme context
    library/
      Library.tsx         grid view: status, tags, search
      useLibrary.ts       library data hook (list, add, status, tags)
    reader/
      Reader.tsx          chrome-less reader + auto-hiding overlay
      PdfPages.tsx        windowed scroll renderer (fit-to-width)
      PageCanvas.tsx      single-page pdf.js rasterization
      Overlay.tsx         thin control overlay (back, slider, theme)
      pdf.ts              pdf.js setup, hooks, page layout math
  shared/types.ts         ReaderApi (window.api) contract
```

Data access (upsert file, positions, theme) is delegated to the core
repositories (`filesRepository`, `settingsRepository`) — this package contains
no raw SQL.

## File access

The renderer reads user PDFs and pdf.js standard-font data through a privileged
custom protocol (`appfile://`), registered in `src/main.ts`:

- `appfile://doc/<encoded-abs-path>` serves a user's PDF
- `appfile://fonts/<name>` serves pdf.js standard font data

This avoids copying large files over IPC and lets pdf.js fetch/range-read
normally (plain `file://` fetch is blocked in the renderer).

## Reader behavior (Phase 1)

- Full-bleed pages, fit-to-width; no visible chrome until you move the mouse or
  click. The overlay (back, title, page slider, page count, theme) auto-hides
  after ~2.5s of inactivity.
- Last page/position is restored on reopen (debounced save + save on close).
- Themes: light, dark, sepia, system.
- Keyboard: Space/PageDown/→ next page, PageUp/← previous.

## Library (Phase 2)

- Grid of registered books, newest first.
- Per-book reading status (unread/reading/finished) and editable tags.
- Search filters by title or tag.
- "Add PDF" opens the file dialog and registers the book by content hash.

## Scripts

```bash
npm start     # run in dev (hot reload; builds core first)
npm run lint  # eslint
npm run typecheck
npm run package
npm run make  # distributable installers
```

Native modules (better-sqlite3) are rebuilt for Electron automatically by Forge
and unpacked from the asar via the `AutoUnpackNativesPlugin`.

## Notes

- `TB_DISABLE_GPU=1 npm start` runs with hardware acceleration disabled —
  useful for VMs/containers where the GPU process is unavailable.
- Phase 1 covers only PDF. Future phases: library view (status/tags/search),
  mobile reflow, Drive/OneDrive sync, and a React Native port.
