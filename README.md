# Taking Book

A distraction-free, local-first document reader with optional Google Drive sync.

## Download

Get the latest version from the
[Releases page](https://github.com/vihao1802/taking-book-desktop-app/releases/latest)
and pick the file for your system under **Assets**.

| System | File | Install |
| --- | --- | --- |
| Windows | `taking-book-desktop-app-<version>.Setup.exe` | Run the installer. Windows SmartScreen may say "Unknown publisher" because the app is not code-signed: click **More info**, then **Run anyway**. |
| macOS (Apple Silicon: M1 or newer) | `.zip` with `darwin-arm64` in its name | Unzip it and drag the app to **Applications**. The app is not notarized, so the first time, right-click it and choose **Open**, then **Open** again. Intel Macs are not supported yet. |
| Linux (Debian/Ubuntu) | `taking-book-desktop_<version>_amd64.deb` | `sudo apt install ./taking-book-desktop_<version>_amd64.deb` |

The macOS file only appears on releases built after macOS support was added.
Your library stays on your device; Google Drive sync is optional.

## Architecture

```mermaid
flowchart LR
  subgraph desktop["packages/desktop (Electron)"]
    renderer["Renderer<br/>React UI"]
    preload["Preload<br/>IPC bridge"]
    main["Main process<br/>SQLite driver, sync scheduler,<br/>Drive client"]
    renderer --> preload --> main
  end

  subgraph mobile["packages/mobile (planned)"]
    rn["React Native UI"]
  end

  core["packages/core<br/>models, repositories, position tracking,<br/>reflow, sync merge"]
  db[("SQLite")]
  drive[("Google Drive<br/>Taking Book/ folder")]

  renderer --> core
  main --> core
  rn -.-> core
  main --> db
  main --> drive
```

`core` is platform-agnostic: SQLite and Drive access are injected by the
platform packages, and platforms never import from each other.

| Package | Description | Status |
| --- | --- | --- |
| `packages/core` | Shared logic (see [AGENTS.md](./AGENTS.md)) | Active |
| `packages/desktop` | Electron app: library, reader, sync | Active |
| `packages/mobile` | React Native app | Planned |

## Quick start

```bash
npm install
npm run build   # builds @taking-book/core; required before typecheck/start
npm test

cd packages/desktop
TB_DISABLE_GPU=1 npm start   # TB_DISABLE_GPU only for VMs/containers
```

Verification: `npm run build && npm run typecheck && npm run lint && npm test`.

## Docs

- [AGENTS.md](./AGENTS.md) — coding rules
- [CONTEXT.md](./CONTEXT.md) — domain glossary
- [docs/shortcuts.md](./docs/shortcuts.md) — keyboard shortcuts
- [docs/google-drive-setup.md](./docs/google-drive-setup.md) — cloud sync setup
- [docs/releasing.md](./docs/releasing.md) — cutting a release
