# Calling the Google Translate endpoint from the Android WebView

Research date: 2026-10-03. Answers issue #62 (map #48). Facts first, then a recommendation; the decision to adopt is the reader's. Anything not confirmed from a primary source is marked **UNVERIFIED**.

## Short answer

- The WebView is a CORS-restricted web page, so `google-translate-api-x` cannot call the endpoint with the WebView's own `fetch`. ADR-0004's "mobile can call the library directly because React Native isn't CORS-restricted" no longer holds under ADR-0009 (Capacitor).
- Capacitor's native HTTP does avoid the browser's CORS check, because the request is made by Java `HttpURLConnection`, not by the WebView. It works either by patching global `fetch` (opt-in config) or by calling `CapacitorHttp.request()` directly.
- The library does not work *unchanged* on the patched `fetch`: the patched `fetch` for POST drops `signal` (so `AbortSignal.timeout` does nothing), sets no native timeouts, and surfaces network failures as non-`TypeError`s, so the desktop failure classifier would mislabel them as `other`.
- A mobile `TranslationEngine` is small. Recommended shape: use the library's documented `requestFunction` hook with `CapacitorHttp.request()` directly, rather than patching global `fetch`.
- No cleartext or extra TLS work is needed: the endpoint is HTTPS. Rate limiting is the same unofficial-endpoint risk as desktop, with a per-device IP.

## 1. Why the WebView cannot call it directly

- The endpoint sends no CORS headers. The library's README says so: "`https://translate.google.com` does not provide CORS http headers allowing access from other domains", and that it works only in "contexts that don't request CORS access, such as a browser extension background script or React Native" ([google-translate-api-x README, FAQ](https://github.com/AidanWelch/google-translate-api), also shipped in npm package 10.7.3 `README.md`).
- Checked directly on 2026-10-03: a POST to `https://translate.google.com/translate_a/single?client=at&dt=t&dt=rm&dj=1` with `Origin: https://localhost` returned HTTP 200 and JSON, with no `Access-Control-Allow-Origin` header in the response. An `OPTIONS` preflight to `/_/TranslateWebserverUi/data/batchexecute` returned 200 with `allow: POST` and no `Access-Control-*` headers. A browser would therefore block a page from reading these responses. (This is a one-off `curl`, not a browser test from a real WebView: **UNVERIFIED** from a device.)
- Capacitor serves the app from `https://localhost` by default (`server.androidScheme` default `https`, [Capacitor config](https://capacitorjs.com/docs/config)), which is a cross-origin page relative to `translate.google.com`.
- ADR-0004 point 3 and its Consequences section assumed mobile = React Native. ADR-0009 replaced that with a Capacitor WebView, so the assumption needs updating if this approach is adopted.

## 2. Does Capacitor native HTTP avoid CORS?

Yes, by construction. Sources: Capacitor source (`ionic-team/capacitor`, `main`), read 2026-10-03.

- `CapacitorHttp` is documented as "native libraries" ([HTTP API docs](https://capacitorjs.com/docs/apis/http)). On Android the plugin runs the request on an executor thread through `HttpRequestHandler.request(...)` / `CapacitorHttpUrlConnection`, a `java.net.HttpURLConnection` wrapper (`android/.../plugin/CapacitorHttp.java`, `.../util/HttpRequestHandler.java`). No WebView networking is involved, so the WebView's CORS enforcement does not apply. (That "native code doesn't enforce CORS" is inferred from the source; the docs page does not state the word CORS explicitly - **UNVERIFIED as a documented guarantee**.)
- Two ways to use it:
  1. **Global patch**: by default off ("`CapacitorHttp` ... Default enabled value: false", [config docs](https://capacitorjs.com/docs/config)). With `plugins.CapacitorHttp.enabled: true`, `native-bridge.js` replaces `window.fetch` and `XMLHttpRequest`.
  2. **Direct call**: `CapacitorHttp.request(options)` / `.post(options)` from `@capacitor/core`, available without enabling the patch (`core/src/core-plugins.ts`, `CapacitorHttpPlugin`). `HttpOptions` has `url`, `method`, `headers`, `data`, `readTimeout`, `connectTimeout`, `responseType`.
- Patched `fetch` details (`android/capacitor/src/main/assets/native-bridge.js`):
  - Requests to the app's own server URL go to the original `fetch` (`CapacitorWebFetch`).
  - For `GET`/`HEAD`/`OPTIONS`/`TRACE` it rewrites the URL through a local proxy URL (`createProxyUrl`) and calls the original `fetch` with the options.
  - For other methods, including the library's `POST`, it calls `nativePromise('CapacitorHttp','request', { url, method, data, dataType, headers })` and wraps the result in `new Response(data, { headers, status })`.
  - **`options.signal` is not forwarded** to the native call in that POST branch, and no `connectTimeout`/`readTimeout` is passed. `HttpRequestHandler` only applies timeouts when the call carries them (`if (connectTimeout != null) ...`), so the platform default applies; what that default is for `HttpURLConnection` here is **UNVERIFIED** (the Android `HttpURLConnection` doc was not fetched).
  - The `Response` is built without `statusText`, so `res.statusText` is `''`.
- Mixed-content/cleartext settings (`server.cleartext`, `android.allowMixedContent`) are for loading from non-HTTPS origins and are documented as dev-only; not relevant to an HTTPS endpoint.

## 3. Does `google-translate-api-x` work unchanged on it?

Source: npm package `google-translate-api-x@10.7.3` (repo `AidanWelch/google-translate-api`), files `lib/defaults.cjs`, `lib/translation/*.cjs`. This is the version used by the desktop engine (confirm `packages/desktop/package.json` pins the same version: **UNVERIFIED**, not checked).

How it calls the network:

- `lib/defaults.cjs`: `requestFunction(url, fetchinit) { return fetch(url, fetchinit); }` and `requestOptions: { credentials: 'omit', headers: {} }`. The README documents `requestFunction` as the override point: inputs `(url, requestOptions)`, and it must "mimick the response of the Fetch API with a `res.text()` and `res.json()` method".
- Default `forceBatch: true`, so a string goes to the batch endpoint (`batchexecute`, POST, `res.text()` then parse). With `forceBatch: false` the single endpoint (`/translate_a/single?...`, POST, `res.json()`) is used, with fallback to batch. The README warns the single endpoint "is much more likely to be ratelimited".
- Both use only `res.ok`, `res.statusText`, `res.text()`/`res.json()`, and on failure throw `new Error(res.statusText, { cause: { options, url, response: res } })`. The desktop engine reads `error.cause.response.status` for 429.

What happens on the patched `fetch` (all inferred from the sources above; none run on a device, so **UNVERIFIED at runtime**):

| Concern | Result |
| --- | --- |
| POST with form body and `Content-Type` header | Goes through the native branch; string body is passed as `data`. Should work. |
| `AbortSignal.timeout(...)` in `requestOptions.signal` | Constructed fine in a modern WebView, but ignored by the native call. The request is not cancelled. `translateText` in core still ends the popup at `TRANSLATION_TIMEOUT_MS` (it races a timer), so the reader is not stuck, but the socket stays open until the platform default. |
| `credentials: 'omit'` | Ignored by the native branch. |
| 429 detection | `res.status` is preserved, so `cause.response.status === 429` still works. `TooManyRequestsError` name matching is unaffected. |
| Network failure | Rejection comes from `nativePromise` (a Capacitor plugin error), not `TypeError: fetch failed`. The desktop `isNetworkFailure`/`causeCode` (undici codes) would return `other` instead of `unreachable`, giving the generic message rather than "Check your connection". The exact error shape is **UNVERIFIED**. |
| `AbortSignal.timeout` availability | MDN marks it Baseline 2024 ("newly available") ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)). Exact Chrome/WebView version number was not readable from the fetched page: **UNVERIFIED**. ADR-0009 sets minimum Android 10, but the WebView version is updated separately and the no-Play-services case is already an open item there. |

Also note the global patch changes every `fetch`/`XMLHttpRequest` to `http(s)` URLs in the app (Drive sync, anything else), not just Translate. That is a wider blast radius than needed for one feature; Drive sync (#51/#56) should be checked against it separately.

## 4. What a mobile `TranslationEngine` looks like

Core interface today (`packages/core/src/translation/translate.ts`; the issue calls it `Translator`, the code and ADR-0004 text differ):

```ts
interface TranslationEngine {
  translate(text: string, targetLanguage: string): Promise<Result<EngineTranslation, TranslationEngineFailure>>;
}
```

It must resolve, never reject; `translateText` adds whitespace normalisation, the 200-character cap, language validation, a 10 s backstop timeout, and kind-to-message mapping. None of that needs to change. The desktop engine (`packages/desktop/src/main/googleTranslateEngine.ts`) is the reference: it calls `translate(text, { to, requestOptions: { signal } })` and classifies failures.

Sketch of the mobile engine (illustrative only; not tested):

1. Call `translate(text, { to: targetLanguage, requestFunction })` where `requestFunction(url, init)` calls `CapacitorHttp.request({ url, method: 'POST', headers: init.headers, data: init.body, connectTimeout: T, readTimeout: T, responseType: 'text' })` and returns `{ ok: status >= 200 && status < 300, status, statusText, text: async () => data, json: async () => JSON.parse(data) }`. This keeps the library's own response parsing and gives real native timeouts, without patching global `fetch`.
2. Reuse the result mapping (`from` handling) from the desktop engine.
3. Classify failures from the `HttpResponse.status` (429 -> `rate-limited`) and from the plugin's rejection for network errors (-> `unreachable`).

Layering (AGENTS.md): the `from`-language reader and failure classifier are currently in `packages/desktop`. If both platforms need them, they should move to `/core` as shared helpers (a small, pure function set), with only the "how to make the HTTP request" part platform-specific. Whether `google-translate-api-x` itself can sit in `/core` is a question for the reader: today core takes the engine by injection and has no dependency on it, which is worth preserving.

`CapacitorHttp.request()` accepts `data` as string or JSON only on Android/iOS ("FormData, Blob, ArrayBuffer ... only directly supported on web or through enabling `CapacitorHttp` ... patched `fetch`", `HttpOptions.data` doc). The library sends a URL-encoded string body, so this limit does not affect it.

## 5. Cleartext, TLS, and rate limiting

- **Cleartext**: not needed. The endpoint is `https://translate.google.<tld>`; Android 9+ disables cleartext by default ([Android network security config](https://developer.android.com/privacy-and-security/security-config)), and Capacitor's `server.cleartext` is for live reload only. Do not enable it for this.
- **TLS**: default system trust anchors apply to `HttpURLConnection`; no pinning or custom certificates are required for Google's public endpoint. `INTERNET` permission is required in the manifest (standard; Capacitor's Android template includes it - **UNVERIFIED** for the template version we will use).
- **Rate limiting**: README: "If too many requests are made, you can either end up with a 429 or a 503 error", no published quota, and the README's own proxy advice (an `agent` through `requestOptions`) is Node-only and not applicable on Android. Android users are a different set of IPs (often mobile carrier NAT), so shared-IP throttling could hit more often than on desktop; this is **UNVERIFIED** (no measurements). Existing design already degrades correctly: inline error, no retry queue (ADR-0004). Note the classifier above only maps 429; the README also names 503.
- **Offline**: native failure must resolve to `unreachable`, never throw, and must not touch local reading state (AGENTS.md: local-first).
- **Legal/ToS**: unchanged from ADR-0004; the library's own README says to use the official API "to be 100% legal". Nothing in this research changes that.

## Recommendation (the reader decides)

1. Prefer a mobile engine built on the library's `requestFunction` + `CapacitorHttp.request()` over turning on the global `CapacitorHttp.enabled` patch. Reason: it gives working timeouts and 429 detection, scopes native HTTP to Translate only, and leaves Drive sync's networking unaffected.
2. If the reader prefers the lowest-effort path, the global patch can work, but accept that timeouts are not enforced natively and that the failure classifier needs a Capacitor-aware branch.
3. Before relying on either, run a 30-minute check on a real device (the same one used for the Reader prototype): translate a word, put the device in airplane mode, and send 30 rapid requests to see the error shapes and when 429 appears. This settles the UNVERIFIED rows above.
4. Update ADR-0004 point 3 (and the `docs/translate-selection-research.md` cross-reference, if affected) when adopted: its React Native premise is superseded by ADR-0009.
5. Fallback if the unofficial endpoint becomes unreliable on mobile: the ADR-0004 alternatives (official API with a key-holding backend; self-hosted LibreTranslate) are unchanged and still sit behind the same `TranslationEngine`.

## Not confirmed

- Behaviour on a real Android WebView (CORS block, native success, error shapes, default timeout, 429 frequency).
- Exact minimum WebView version for `AbortSignal.timeout`.
- Whether `HttpURLConnection` default connect/read timeouts are infinite when not passed.
- Whether `packages/desktop` pins `google-translate-api-x@10.7.3`.
- Whether the Capacitor Android template manifest declares `INTERNET` in the version we will scaffold.

## Sources

- Capacitor HTTP API: https://capacitorjs.com/docs/apis/http
- Capacitor config (`CapacitorHttp.enabled`, `server.androidScheme`, `server.cleartext`): https://capacitorjs.com/docs/config
- Capacitor source (read 2026-10-03, `main`): `android/capacitor/src/main/assets/native-bridge.js`, `android/capacitor/src/main/java/com/getcapacitor/plugin/CapacitorHttp.java`, `.../plugin/util/HttpRequestHandler.java`, `core/src/core-plugins.ts` in https://github.com/ionic-team/capacitor
- `google-translate-api-x@10.7.3` package contents (npm) and README: https://github.com/AidanWelch/google-translate-api
- Android network security config: https://developer.android.com/privacy-and-security/security-config
- MDN `AbortSignal.timeout()`: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
- Repo: `docs/adr/0004-translate-unofficial-api-via-main-process.md`, `docs/adr/0009-android-app-is-capacitor-around-shared-renderer.md`, `packages/core/src/translation/translate.ts`, `packages/desktop/src/main/googleTranslateEngine.ts`
