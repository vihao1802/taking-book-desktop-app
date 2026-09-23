# Translate-on-selection: API and library research

Research for a "select word/passage in the reader → show translation popup" feature (similar to the browser Google Translate select-to-translate experience). This is input to a later `/grill-with-docs` design session — it is not a decision document. No application code was written as part of this research.

Scope constraints from `AGENTS.md` that shaped what to check for each option:

- `/packages/core` cannot `import` Electron, `react-dom`, or `react-native`. Any platform-specific behavior needs a shared interface + per-platform implementation (dependency injection).
- This is a **client-only app** (Electron desktop + React Native mobile, no existing backend server). That makes "does this need a backend proxy to hide a secret key" and "can I call it with plain `fetch`" first-order questions, not afterthoughts.

---

## 1. Official translation APIs

### Google Cloud Translation API (Basic v2 / Advanced v3)

- **Auth model:** Basic (v2) accepts a simple API key. Advanced (v3) is project-based and expects OAuth2 / a service-account credential, though v3 also supports API keys for simple calls. Source: [Cloud Translation REST reference](https://docs.cloud.google.com/translate/docs/reference/rest).
- **Free tier:** first 500,000 characters/month, Basic + Advanced combined. Source: [Cloud Translation pricing](https://cloud.google.com/translate/pricing), corroborated by [Cloud Translation quotas](https://docs.cloud.google.com/translate/quotas).
- **Pricing beyond free tier:** Basic and Advanced both bill standard NMT translation at **$20 per million characters**; Advanced adds glossaries/batch/document translation at extra cost (e.g. document translation ~$0.08/page). These exact figures come from Google's own pricing page but that page renders its table via JavaScript, so I could not pull the numbers with a plain fetch — they're corroborated via search-indexed copies of the same official page rather than a raw HTML read. Treat as "very likely right, worth a 30-second live check before committing."
- **Rate limits** (from [Cloud Translation quotas](https://docs.cloud.google.com/translate/quotas), fetched directly): v2 — 300,000 requests/min/project; v3 — 6,000 requests/min/project; general-model character throughput 6,000,000 characters/min/project; per-request size 5,000 characters recommended, 30,000 max (Advanced), 100 KB max (Basic).
- **Backend proxy needed?** Effectively yes for a shipped client app. Google API keys are restricted by "application restriction" type (HTTP referrer, IP address, or Android/iOS app signature) — none of these cleanly cover "one API key baked into an Electron app running on arbitrary user machines" or "one key shared across both an Electron desktop build and a React Native mobile build." An unrestricted key embedded in a distributed app is scrapeable from the binary/network traffic. This is an inference from how Google API key restrictions work, not a line explicitly telling you "don't call this from a client app" — but it's the standard reason people put a thin backend in front of Google Cloud APIs.
- **Offline support:** none. Cloud-only.

### DeepL API

- **Auth model:** API key sent as an `Authorization: DeepL-Auth-Key <key>` header. Free-plan keys are distinguishable by a `:fx` suffix and hit a different base URL (`api-free.deepl.com` vs `api.deepl.com`). Source: [DeepL API auth docs](https://developers.deepl.com/docs/getting-started/auth).
- **Explicit client-side warning:** the docs state outright: **"Do not use it in client-side code"** — the key must stay server-side / out of "publicly-distributed code," and should be stored in an environment variable. Source: same auth doc. This is the most direct "you need a backend proxy" statement of any option researched.
- **Free tier:** DeepL's own docs still describe a Free plan (the `:fx` key). However, multiple 2026 sources (DeepL's help-center article and third-party trackers) report that as of ~July 2026 DeepL stopped selling the old **API Free** and **API Pro** plans to new customers, replacing them for new signups with a **Developer** plan (1,000,000 characters total, one-time, for eval only — not recurring monthly) and a **Growth** plan (~$26/month, 1M characters/month on monthly billing or 12M/year on annual billing, then overage, capped at 50M/month). I could not get a clean primary-source fetch of DeepL's own pricing/plans page (it's behind a Cloudflare bot challenge from this environment), so this specific "Free plan discontinued for new signups" claim is sourced from secondary trackers, not DeepL's own page directly — **verify against `https://www.deepl.com/en/your-account/keys` / `https://developers.deepl.com/docs` at design time**, since existing free-plan customers may be grandfathered even if new signups can't get one.
- **Rate limits:** not numerically specified in the docs excerpt fetched; the docs do say to retry `429`/`5xx` responses with exponential backoff, implying rate limiting exists but isn't published as a fixed number.
- **Backend proxy needed?** Yes, explicitly, per DeepL's own docs.
- **Offline support:** none. Cloud-only. (DeepL does sell an on-prem/appliance product for enterprise, but that's a different product from the public API and not relevant to a solo/small app.)

### Microsoft Translator (Azure AI Translator / "Foundry Tools")

- **Auth model:** three options — resource key via `Ocp-Apim-Subscription-Key` header, a short-lived bearer token obtained from that key, or Microsoft Entra ID (managed identity / service principal) for keyless auth. Source: [Azure text translation overview](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation-overview).
- **Free tier (F0):** 2,000,000 characters/month, standard + custom-translation training combined, permanent (not a 12-month trial) — per the same overview page and corroborated by search-indexed copies of Azure's pricing page.
- **Pricing beyond free tier:** Standard/pay-as-you-go (S1) is commonly cited at **$10 per million characters** for text translation; I couldn't get exact numbers out of the live Azure pricing page via fetch (it renders the price cells via JS, showing `$-` placeholders in the fetched HTML), so this figure is corroborated via search rather than a raw read of the primary page. Source page to re-check at design time: [Azure Translator pricing](https://azure.microsoft.com/en-us/pricing/details/translator/).
- **Rate limits / service limits:** per [translation overview](https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation-overview) — NMT translate requests: max 1,000 array elements per request, 50,000 characters max per array element; LLM-backed translation (newer option): max 50 array elements, 5,000 characters per element. `429` on quota exceeded.
- **Backend proxy needed?** Same practical issue as Google: Azure resource keys aren't scoped to "this exact app install," so an unrestricted key shipped in a distributed client is exposed. No explicit "don't call from client code" line was found in the fetched docs (unlike DeepL), but nothing suggests it's safe either — this is inferred from the general shape of subscription-key auth, not an explicit statement in Microsoft's docs.
- **Offline support:** a **Docker container** option exists for "disconnected" translation, per the overview page's "Development options" table (links to a separate containers doc not fetched in depth here) — this is the one official-vendor path with a genuine offline/local story, worth a closer look if offline reading (no internet) matters for this app.

### LibreTranslate (self-hostable, open source)

- **What it is:** "Free and Open Source Machine Translation API, entirely self-hosted," built on the open-source Argos Translate engine rather than a proprietary vendor. AGPL-3.0 licensed. Source: [LibreTranslate GitHub](https://github.com/LibreTranslate/LibreTranslate), [LibreTranslate docs](https://docs.libretranslate.com/).
- **Self-hosted install:** `pip install libretranslate` then run `libretranslate` (binds `localhost:5000` by default); Docker/Docker Compose and Kubernetes manifests are also present in the repo for containerized deployment. Source: [LibreTranslate docs quickstart](https://docs.libretranslate.com/) and repo root files.
- **API key:** **not required for a self-hosted instance.** The managed public instance at `libretranslate.com` does require an `api_key` — the docs are explicit: *"The `api_key` parameter is only required when using an instance configured with API keys, such as libretranslate.com."* Source: [API usage guide](https://docs.libretranslate.com/guides/api_usage/).
- **Maintenance status:** actively maintained — 1,700+ commits on `main`, ~16.7k GitHub stars, live CI workflows. Source: GitHub repo (fetched directly).
- **Backend proxy needed?** If self-hosting: you *are* the backend — the app would call your own server, no vendor key to hide. If using the public `libretranslate.com` instance instead of self-hosting, that instance's API key has the same "don't ship it in a distributed client" problem as the commercial vendors, and it's explicitly rate-limited/paid for heavy use (see their site for current terms; not re-verified here).
- **Offline support:** yes, and this is LibreTranslate's main differentiator — once self-hosted with the Argos Translate models downloaded, translation runs fully offline/local. This is the only option in this list that is offline-capable and free simultaneously, at the cost of running (and keeping warm) a server process yourself, which conflicts with "no existing backend server" unless the user runs it locally themselves or it ships bundled.

---

## 2. Unofficial / free (no-API-key) options

Both packages below hit Google Translate's public **web** endpoint (the one `translate.google.com` itself uses), not the official paid Cloud Translation API. Neither requires a Google Cloud account or API key.

### `@vitalets/google-translate-api`

- **What it does:** "A free and unlimited API for Google Translate," pet-project/prototyping framing. Source: [GitHub — vitalets/google-translate-api](https://github.com/vitalets/google-translate-api) (README fetched directly).
- **Explicit ToS/legal warning from the maintainer:** *"To be 100% legal please use official Google Translate API. This project is mainly for pet projects and prototyping."* — the maintainer is upfront that this is not sanctioned by Google and shouldn't be relied on for anything that needs to be "100% legal."
- **Reliability / rate-limiting:** the README itself documents `TooManyRequestsError` (HTTP 429) when too many requests come from the same IP, and ships built-in proxy-agent support specifically as a workaround for that. This is a maintainer-acknowledged, not just observed, limitation.
- **Maintenance:** actively maintained; a v9 rewrite exists with legacy docs kept on a separate branch; 241+ commits, live GitHub Actions. Last npm publish per the registry: **v9.2.1, 2025-01-21**.
- **Technical/portability:** uses the **Fetch API**, not Node-only modules (`http`, `child_process`, etc.). The README explicitly calls out support for **Node.js, React Native ("leveraging React Native's full Fetch API support"), and browser extensions** — but explicitly **not standard web pages**, because `translate.google.com` doesn't send CORS headers, so a same-origin browser `fetch` from an ordinary page gets blocked by the browser's CORS enforcement. This matters directly for the Electron split: an Electron **renderer** process is a Chromium web page and is subject to the same CORS blocking as a browser tab; an Electron **main** process is plain Node.js and is not subject to browser CORS at all. So this library is usable from Electron main (and proxied to the renderer over IPC) or from a React Native app directly, but not from unmodified renderer-process code.

### `google-translate-api-x`

- **What it is:** an actively developed fork of the above, now maintained by AidanWelch. npm registry confirms: latest **v10.7.3**, published **2026-05-25**, repo at [github.com/AidanWelch/google-translate-api](https://github.com/AidanWelch/google-translate-api) (npm package name is `google-translate-api-x`, GitHub repo folder name is the un-suffixed `google-translate-api`).
- **Why it exists / what's different:** per the README, other forks either use only the single-translate endpoint ("quickly rate limited") or only the batch endpoint ("sometimes inaccurate"); this fork supports both, plus a pluggable request function and translation batching in one call.
- **Rate-limiting risk:** the README states the single-translate endpoint is "much more likely to be ratelimited and have your request rejected than the batch translate endpoint," and caps individual calls at **5,000 characters**. It documents passing a proxy agent (e.g. `https-proxy-agent`) through `requestOptions` as a workaround for rate limiting — same posture as the upstream package: acknowledged, mitigated with proxies, not solved.
- **ToS:** the fetched README does not carry as explicit a "not 100% legal" disclaimer as the vitalets original, but it's the same underlying mechanism (unofficial access to Google's web translate endpoint) and inherits the same risk.
- **Technical/portability:** explicitly built to be "crossplatform" and documents working from a "browser extension background script or React Native." Uses **Fetch and/or Axios**, not Node's `http` module. Same CORS caveat as above: it works where CORS doesn't apply (Node, RN, extension background scripts) but not from an ordinary web-page-style fetch, which is what an Electron renderer is.

---

## 3. Cross-platform compatibility, mapped to this repo's constraint

`AGENTS.md` requires any platform-specific behavior to go through a shared interface implemented per platform (DI), because `/packages/core` can't import Electron or React Native. Practically, for a translate feature, that means: `/packages/core` would define something like a `Translator` interface (`translate(text, targetLang): Promise<Result<...>>`), and each platform package supplies an implementation — which is exactly the shape all of the researched options need anyway, because *none* of them can be called identically from both Electron's renderer and React Native without at least one adapter:

| Concern | Google Cloud / DeepL / Azure (official) | `@vitalets/google-translate-api` / `google-translate-api-x` (unofficial) | LibreTranslate (self-hosted) |
|---|---|---|---|
| Portable transport | Plain HTTPS/REST — works via `fetch` anywhere (Node, Electron main, Electron renderer, RN) | Plain `fetch`/Axios — no Node-only APIs | Plain HTTPS/REST — works via `fetch` anywhere |
| React Native compatible | Yes — it's just HTTP | Yes, per both READMEs — RN's `fetch` has "full Fetch API support" | Yes — it's just HTTP, and RN fetch isn't a browser CORS-enforcing context |
| Electron renderer compatible | Yes, but the vendor API key would be exposed in renderer code/network traffic unless proxied | **No, blocked by CORS** if called directly from renderer code (`translate.google.com` sends no CORS headers) — must be called from Electron **main** and passed to renderer via IPC | Yes if pointed at a self-hosted server (no CORS issue with your own server if you set headers, or call from main and IPC it) |
| Electron main compatible | Yes | Yes — Node isn't CORS-restricted | Yes |
| Needs a secrets-holding backend | Yes, functionally, for all three (DeepL says so explicitly; Google/Azure keys aren't cleanly restrictable to a distributed client) | No API key at all, so nothing to hide — but see ToS/reliability caveats above | No (self-hosted = you're the backend; no vendor secret) |

None of the researched libraries depend on Node-only APIs like `child_process` — all are HTTP-based, so the real platform-compatibility fork in this repo isn't "Node vs RN," it's "does this call have to run in a CORS-enforcing browser-like context (Electron renderer) or not." That pushes toward routing any of these calls through Electron's **main** process (which already fits the "platform glue lives in `/packages/desktop`, not `/packages/core`" rule) and calling directly from React Native, behind a shared `Translator` interface defined in `/packages/core`.

---

## 4. Text-selection-to-translate UX prior art (lower priority)

- **This repo already has the exact interaction primitive needed**, for highlighting/notes, which a translate action would piggyback on:
  - `packages/desktop/src/renderer/reader/ReflowReader.tsx` (`handleMouseUp`, around line 469) listens for `mouseup` on the reader's article container, reads `window.getSelection()`, bails if the selection `isCollapsed` or empty, converts the selection into paragraph-relative offsets via `selectionToParagraphs`, and positions a floating toolbar at the selection's bounding rect (`rect.left`, `rect.bottom + 8`).
  - `packages/desktop/src/renderer/reader/SelectionToolbar.tsx` renders that floating toolbar — currently highlight-color swatches + an "Add note" button — anchored with `position: fixed` at the computed `x`/`y`, with `onPointerDown`/`onClick` stopping propagation so clicking the toolbar doesn't collapse the selection.
  - `packages/desktop/src/renderer/reader/PdfPageView.tsx` has an equivalent `handleMouseUp` for the PDF page view.
  - There's no debounce in this codebase's pattern — it's a direct `mouseup` handler, not a `selectionchange` listener, which avoids firing repeatedly during an in-progress drag-select.
  - A translate button is a natural addition to `SelectionToolbar.tsx` alongside the existing highlight/note actions, reusing the same selection → rect → floating-toolbar pipeline already proven out for annotations.
- **Standard web primitive:** `window.getSelection()` returns a `Selection` object representing the user's current selection or caret position; MDN's own reference page doesn't prescribe a specific event for "user finished selecting," which matches this repo's choice of `mouseup` over `selectionchange` (the latter fires continuously during drag-selection and would need debouncing). Source: [MDN — `Window.getSelection()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection).
- **React Native has no equivalent primitive yet, which matters because `packages/mobile` is not started.** `packages/mobile` currently contains only `package.json`/`assets` (description: "React Native mobile app for Taking Book (Phase 5, not yet started)") — there's no reader UI to hang a selection handler off yet. React Native's `<Text selectable>` prop enables native copy/paste selection UI but, per React Native's own docs, does **not** expose an `onSelectionChange` callback or any selection-range API comparable to `window.getSelection()` — Source: [React Native `Text` docs](https://reactnative.dev/docs/text). Getting "user selected this range of text" on RN typically requires either a native module or a custom text-rendering approach; this is a real open design question for the mobile side of this feature, independent of which translation API gets chosen.

---

## Options at a glance

| API / library | Auth needed | Free tier | Client-callable without a backend proxy? | RN-compatible? |
|---|---|---|---|---|
| Google Cloud Translation (v2/v3) | API key or OAuth2 service account | 500,000 chars/month | Not safely — key isn't cleanly scopable to a distributed client app | Yes (plain HTTP) |
| DeepL API | API key (`:fx` = free plan) | Free plan historically 500k chars/mo; **new signups reportedly pushed to Developer (1M chars one-time) / Growth (~$26/mo) as of mid-2026, unverified against primary source** | **No — DeepL's own docs say explicitly not to use it in client-side code** | Yes (plain HTTP) |
| Microsoft/Azure Translator | Subscription key / bearer token / Entra ID | 2,000,000 chars/month (F0), permanent | Not safely — same key-exposure issue as Google | Yes (plain HTTP) |
| LibreTranslate (self-hosted) | None (self-hosted) / API key (public libretranslate.com) | Unlimited if self-hosted; free public instance has a required key + limits | **Yes, if self-hosted** — no vendor secret to hide | Yes (plain HTTP to your own server) |
| `@vitalets/google-translate-api` | None | Unofficial/"unlimited" but rate-limited by IP | Yes, but blocked by CORS from an Electron **renderer**; fine from Electron main or RN | Yes, per README |
| `google-translate-api-x` | None | Unofficial/"unlimited" but rate-limited, 5,000 chars/call cap | Same CORS caveat as above | Yes, per README |

## Recommendation (for discussion, not a decision)

Given the constraints stated for this task — client-only app, no existing backend server, must run on both Electron and React Native — the two options that fit with the least new infrastructure are **LibreTranslate self-hosted** and **the unofficial `google-translate-api-x` package called from Electron's main process / directly from React Native**. LibreTranslate is the only path here that is simultaneously free, has no vendor key to protect, and works fully offline — which matters a lot for a local-first reading app — but it requires standing up and maintaining a server process (even if that's just a Docker container the user runs locally), which is new operational surface this repo doesn't currently have. `google-translate-api-x` (or the original `vitalets` package) needs zero backend and zero signup, fits the "no server" constraint most literally, and — per its own README — is explicitly built to be crossplatform (Node/RN/Electron main), but it's an unofficial scrape of Google's web endpoint: the maintainers themselves flag rate-limiting/429s as a known, not hypothetical, failure mode, and it carries real ToS risk for anything beyond prototyping. The three paid vendor APIs (Google/DeepL/Azure) all effectively require a backend proxy to hold a secret safely in a shipped client app — DeepL says so outright — which conflicts with "no existing backend server" unless the team is willing to stand one up (even a small serverless function) purely to hide a key, at which point LibreTranslate's self-hosted option starts looking more attractive since it removes the vendor-lock-in and per-character billing that a proxy-for-a-paid-API would still carry.
