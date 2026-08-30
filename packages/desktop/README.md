# Taking Book — Desktop Reader

The Electron desktop app for Taking Book. UI and platform glue only: all data
logic lives in [`@taking-book/core`](../core) and is imported from here.

> **Phase 4 in progress.** Phases 1–2 (chrome-less reader, library grid with
> status/tags/search) are complete. Phase 3 added a reflow prototype reader
> (pdf.js text extraction → core reflow engine). Phase 4 adds cloud-drive sync:
> pick any folder kept in sync by Dropbox/Google Drive/Nextcloud, and the app
> pushes a manifest + content-addressed blobs there and pulls them on other
> devices, with last-write-wins conflict handling.

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
      ipc.ts                IPC handlers (open, position, theme, sync)
      sync.ts               device id + sync-folder glue for the core engine
      syncStorage.ts        folder-backed SyncStorage (atomic writes)
    renderer/
      App.tsx               Library <-> Reader state routing
      theme.tsx             light / dark / sepia / system theme context
      library/
        Library.tsx         grid view: status, tags, search, sync bar
        useLibrary.ts       library data hook (list, add, status, tags, sync)
      reader/
        Reader.tsx          chrome-less reader + auto-hiding overlay
        PdfPages.tsx        windowed scroll renderer (fit-to-width)
        PageCanvas.tsx      single-page pdf.js rasterization
        ReflowReader.tsx    flowing reflow view (figures + page separators)
        ReflowFigure.tsx    lazy figure block (IntersectionObserver + URL cache)
        useReflowDocument.ts pdf.js getTextContent/operator-list → core reflow pipeline
        reflowImages.ts     operator-list image scan, decoder interface, LRU cache
        Overlay.tsx         thin control overlay (back, page/reflow toggle, theme)
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

## Reflow (Phase 3 prototype)

- The overlay's ¶ button toggles between page (rasterized) and reflow views.
- Reflow extracts text with pdf.js `getTextContent`, feeds fragments into the
  core reflow engine, and re-wraps the text to the full viewport width, so zoom
  scales the font and the number of words per line follows. It renders the
  document's PDF figures as blocks in the reading flow (each kept at its PDF
  size, scaled down only when wider than the viewport, never up) and inserts a
  thin rule with a small page number wherever the PDF page changes.
- Figures are extracted from each page's pdf.js operator list and anchored
  between paragraphs by position; the pixel data is decoded lazily (an
  `ImageDecoder` interface, `ImageBitmap` only for now) as figures near the
  viewport, with a bounded LRU cache of decoded object URLs so image-heavy
  books don't hold every figure in memory. The paragraph list is never
  reordered, so saved highlight anchors stay valid.

## Sync (Phase 4)

- The library header has a sync bar: pick any folder (typically one kept in
  sync by Dropbox/Google Drive/Nextcloud) and hit **Sync now**.
- The app maintains a content-addressed store (`userData/blobs/<hash>`) so
  books are identified and transferred by hash, never by path.
- Adding a PDF copies it into that store before registering; removing a book
  tombstones it so the delete propagates to other devices.
- The engine (in core) is local-first: a failed or missing sync folder never
  blocks reading or corrupts the library.

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
- Phase 1 covers only PDF. Future phases: mobile reflow, Drive/OneDrive sync
  polish, and a React Native port.
