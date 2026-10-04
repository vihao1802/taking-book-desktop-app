# Google Drive sync setup

Cloud sync uses Google Drive with the OAuth device flow (ADR-0010). Core implements
last-write-wins merge with per-record clocks, tombstones, and a
content-addressed blob store; the desktop app syncs a manifest + blobs into a
`Taking Book/` Drive folder.

Connect via the in-app "Connect Google Drive" flow: the app shows a code, copies it to the clipboard and opens Google's verification page; paste the code and approve. Tokens are stored encrypted
via Electron `safeStorage` and auto-refreshed on expiry.

## Using your own OAuth client

Create an OAuth client of type "TVs and Limited Input devices" (every platform shares this one client). Copy `packages/desktop/.env.example` to `packages/desktop/.env` and fill in
`TB_GDRIVE_CLIENT_ID` / `TB_GDRIVE_CLIENT_SECRET` (or set them as env vars; the
token endpoint rejects requests without a client secret).

The `.env` file is gitignored. The Forge build bundles it into packaged apps'
`resources/` when present, so packaged builds resolve credentials without
committing them.
