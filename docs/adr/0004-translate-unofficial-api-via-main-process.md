# ADR-0004: Translate calls an unofficial Google Translate library from Electron's main process

Status: accepted

## Context

The reader is getting a "translate on text selection" feature: select a word or short phrase, see it translated into the reader's Target language. Three commercial vendor APIs were evaluated (Google Cloud Translation, DeepL, Azure Translator) — all require an API key kept server-side; DeepL's own docs explicitly forbid calling it from client-side code, and Google/Azure keys aren't scoped tightly enough to ship safely inside a distributed desktop/mobile client either. This app is client-only with no backend server, and standing one up purely to hold a translation-vendor secret was rejected as disproportionate for a feature this small in a non-commercial project.

`google-translate-api-x` (and its predecessor `@vitalets/google-translate-api`) call Google Translate's public web endpoint directly, need no API key, and are explicitly built to be cross-platform (Node, React Native, browser extension background scripts). Their own READMEs are upfront that this isn't the sanctioned Google Translate API: requests can be rate-limited or blocked (`TooManyRequestsError`/429) with no published quota, and the maintainer says "to be 100% legal please use the official Google Translate API." This project accepts that risk because it is non-commercial and the library gives up nothing else the vendor APIs would have required (a key, a backend, a bill).

That endpoint sends no CORS headers, so the library is blocked from an ordinary browser-page context. An Electron **renderer** is exactly that — a Chromium web page subject to CORS — while Electron's **main** process is plain Node and isn't CORS-restricted, and React Native's Fetch implementation isn't either.

## Decision

1. Translation is performed with `google-translate-api-x`, not an official vendor API.
2. On desktop, the call is made from Electron's **main** process, never the renderer, and reaches the renderer over IPC like the app's other main-process capabilities: a `translate:<action>` channel wired through `preload.ts`, `ReaderApi` in `shared/types.ts`, and `main/ipc.ts`, returning the app's standard `Result<T>` shape.
3. `/packages/core` defines a platform-agnostic `Translator` interface (the same DI shape as the existing `SqlDriver`), so mobile can later supply its own implementation — calling the library directly, since React Native isn't CORS-restricted — without needing the desktop main-process/IPC wiring.

## Consequences

- Translation has no published, contracted rate limit: the app can be rate-limited or blocked by Google at any time with no SLA. The feature surfaces that as a plain inline error in the Translation popup, with no retry queue.
- Swapping to an official vendor API later is contained to one `Translator` implementation behind the core interface, but would also reintroduce the need for a key-holding backend that this decision avoids.
- A translate call cannot be made directly from the renderer; any future renderer-side code must go through the main-process IPC channel rather than `fetch`ing the endpoint itself.

## Alternatives considered

- **Official vendor API (Google Cloud Translation / DeepL / Azure) with a small backend proxy to hold the key.** Rejected: adds a server this client-only, non-commercial app doesn't otherwise need, purely to protect a secret.
- **Self-hosted LibreTranslate.** Rejected for v1: genuinely free and offline-capable, but requires the user to run and keep a server process alive, which is new operational surface the app doesn't otherwise have. Left as a documented alternative in `docs/translate-selection-research.md` if the unofficial library's reliability becomes a problem.
