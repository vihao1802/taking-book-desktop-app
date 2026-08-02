# Taking Book

A distraction-free, cross-platform document reader: shared core logic + Electron
desktop app + React Native mobile app, backed by SQLite and cloud-drive sync.

## Packages

| Package | Description | Status |
| --- | --- | --- |
| `packages/core` | Platform-agnostic logic: models, SQLite repositories, position tracking, hashing, text reflow, sync merge | Phase 1 + 4 complete |
| `packages/desktop` | Electron desktop app (library + reader + reflow prototype + theme + sync) | Phase 1–4 complete |
| `packages/mobile` | React Native mobile app | Phase 5, not started |

## Conventions

See [AGENTS.md](./AGENTS.md) — the monorepo coding rules (structure, TS strictness,
Result-style data access, testing).

## Scripts

```bash
npm install   # install all workspaces
npm run build # build @taking-book/core (must run before typecheck/desktop)
npm test      # run core unit tests
npm run typecheck
npm run lint
```

Run the desktop app:

```bash
cd packages/desktop
TB_DISABLE_GPU=1 npm start   # TB_DISABLE_GPU for VMs/containers
```

## Phases

1. **Phase 1 — Reader core (done):** chrome-less Electron PDF reader, themes,
   last-read-position memory, content-hash file identity.
2. **Phase 2 — Library (done):** grid view, status/tags, search.
3. **Phase 3 — Mobile reflow (prototype done):** core reflow engine (PDF text
   items → flowing paragraphs) + desktop prototype reader with page/reflow toggle.
4. **Phase 4 — Sync (done):** Google Drive OAuth cloud sync. Core implements
   last-write-wins merge with per-record clocks, tombstones, and a
   content-addressed blob store; the desktop app syncs a manifest + blobs into a
   `Taking Book/` Drive folder. Connect via the in-app "Connect Google Drive"
   flow (loopback OAuth); tokens are stored encrypted via Electron `safeStorage`
   and auto-refreshed on expiry.
5. **Phase 5 — React Native port** of the reader using `packages/core`.
