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

   To use your own Google Cloud OAuth client, copy
   `packages/desktop/.env.example` to `packages/desktop/.env` and fill in your
   `TB_GDRIVE_CLIENT_ID` / `TB_GDRIVE_CLIENT_SECRET` (or set them as env vars;
   the token endpoint rejects requests without a client secret). The `.env`
   file is gitignored; the Forge build bundles it into packaged apps'
   `resources/` when present, so packaged builds resolve credentials without
   committing them.
5. **Phase 5 — React Native port** of the reader using `packages/core`.

## Releases

End users download the app from the **GitHub Releases** page of this repo. A
tagged release triggers a GitHub Actions workflow
(`.github/workflows/release.yml`) that builds a `.deb` (Linux) and a `.exe`
(Windows) and attaches them to the release.

### Cutting a release

1. Bump the version in `packages/desktop/package.json` and commit.
2. Push a tag named `v<version>` (matching the `package.json` version), e.g.:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   The workflow builds both platforms and publishes the release notes
   automatically from the commits since the last tag.
3. Verify the release at `https://github.com/vihao1802/taking-book-desktop-app/releases`.

Notes:

- **Google OAuth credentials** are injected from the `TB_GDRIVE_CLIENT_ID` /
  `TB_GDRIVE_CLIENT_SECRET` repository secrets at build time. They must be
  set in the repo's *Settings → Secrets*; the publisher's (verified) client is
  used for end users. Without them the app builds but cloud sync is disabled.
- **Windows build** (Squirrel `.exe`) is unsigned — SmartScreen will warn users
  "Unknown publisher". Signing needs a code-signing certificate; see
  `.github/workflows/release.yml` if that becomes necessary.
- **macOS**: a `.dmg`/`.app` must be built and notarized on a Mac (GitHub
  `macos-latest` runners) and requires an Apple Developer account. Not wired
  up yet — Linux and Windows are the current release targets.
- Install the Linux package with `sudo apt install ./taking-book-desktop-app_*.deb`.
