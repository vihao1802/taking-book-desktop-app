# Taking Book

A distraction-free, cross-platform document reader: shared core logic + Electron
desktop app + React Native mobile app, backed by SQLite and cloud-drive sync.

## Packages

| Package | Description | Status |
| --- | --- | --- |
| `packages/core` | Platform-agnostic logic: models, SQLite repositories, position tracking, hashing | Phase 1 complete |
| `packages/desktop` | Electron desktop app (library + reader + theme) | Phase 1 complete, Phase 2 complete |
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
3. **Phase 3 — Mobile reflow:** re-layout PDF text for narrow screens.
4. **Phase 4 — Sync:** cloud-drive sync with conflict handling.
5. **Phase 5 — React Native port** of the reader using `packages/core`.
