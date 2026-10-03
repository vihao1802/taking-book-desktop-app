# PDF rendering and text extraction options on Android

Research date: 2026-10-03. Answers issue #49 (parent map #48). Question: which ways exist to render PDF pages and extract positioned text on Android (pdf.js in a WebView, native `PdfRenderer`, React Native PDF libraries), judged on page-mode quality at tablet sizes, text selection, text/figure extraction for Reflow mode, memory with large PDFs, and licences (must be free for commercial use).

Sources are first-party: Android API reference pages, library READMEs and repos, and the licence field of each GitHub repo (read through the GitHub API on the date above). Where a claim could not be confirmed from a primary source it is marked **unverified**.

## What our Reflow mode needs from the engine

Grounded in this repo:

- `packages/core/src/reflow.ts` consumes `ReflowTextItem` (`str`, `x`, `y`, `width`, `fontSize`, plus `bold`/`italic`/`monospace`/`color`), described in its header as "positioned PDF text items (from pdf.js getTextContent)".
- The desktop renderer builds those items in `packages/desktop/src/renderer/reader/useReflowDocument.ts` from `page.getTextContent()` and `page.getOperatorList()` (the latter also drives ink-colour detection in `textColors.ts` through pdf.js `OPS`). Page mode draws a pdf.js `TextLayer` over the canvas in `PdfPageView.tsx` for selection.

So an engine only supports Reflow without rework if it returns, per text fragment, the string plus position, size, font name and ideally colour. An engine that returns only a plain text string cannot feed `reflow.ts`.

## Summary table

| Option | Page-mode render | Text selection | Positioned text for `/core` reflow | Figures | Licence |
|---|---|---|---|---|---|
| pdf.js in a WebView | Yes (canvas) | Yes (`TextLayer`, same as desktop) | Yes, identical `getTextContent` / `getOperatorList` input as desktop | Yes, via operator list (as desktop) | Apache-2.0 |
| Platform `PdfRenderer` (API 21+) | Yes (bitmap) | No before API 35; API 35+ has `selectContent` | No: text is plain strings only, no coordinates or fonts | API 35+: image content with alt text only | Part of Android (Android Content License) |
| `androidx.pdf` viewer (beta) | Yes | Yes (viewer UI) | No documented positioned-text API found | Image selection only | Content/code under Android's licence (see below) |
| `react-native-pdf` (wonday) | Yes (PdfiumAndroid) | Not documented on Android | No | No | MIT (wraps Pdfium) |
| `react-native-pdf-renderer` | Yes (platform `PdfRenderer`) | No, stated in README | No | No | MIT |
| AndroidPdfViewer (barteksc) | Yes (PdfiumAndroid) | Not documented | No | No | Apache-2.0 |
| MuPDF | Yes | Yes | Yes (structured text), but see licence | Yes | **AGPL-3.0**, so not free for closed commercial use |

## 1. pdf.js inside a WebView

- **Licence.** Apache-2.0 ([repo licence field](https://github.com/mozilla/pdf.js), [package.json](https://raw.githubusercontent.com/mozilla/pdf.js/master/package.json)). Free for commercial use.
- **Same engine as desktop.** The desktop app already uses `pdfjs-dist` `^6.2.108` (`packages/desktop/package.json`). Running the same library on Android means `getTextContent()` and `getOperatorList()` produce the same shapes that `reflow.ts`, `textColors.ts` and the reflow image code already handle, so the core logic is reused unchanged and only the host differs.
- **Text selection.** pdf.js provides `TextLayer`, which the desktop page view already uses (`PdfPageView.tsx`). Native touch selection handles in the WebView act on that DOM layer. Touch behaviour is not documented by pdf.js and needs a prototype (**unverified**).
- **Browser support.** The pdf.js README says the "Modern browsers" build "assumes native support for the latest JavaScript features" and a separate legacy build exists (`gulp generic-legacy`, "if you need to support older browsers") ([README](https://github.com/mozilla/pdf.js)). The project FAQ lists the legacy build as supported on Chrome 125+ ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)). Android System WebView is Chromium based, so the pdf.js version we ship must match the WebView Chromium version on target devices. How current the WebView is on a device without Google Play could not be confirmed from the Android docs I could reach (**unverified**), so the minimum Android version should be set after a device check, and the legacy build used if needed.
- **Worker and file access.** The FAQ says the exact same version of `pdf.js` and `pdf.worker.js` must be used, and that pdf.js follows normal browser same-origin rules ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)). In `react-native-webview`, file access is off by default: `allowFileAccess` defaults to `false` on Android, as do `allowFileAccessFromFileURLs` and `allowUniversalAccessFromFileURLs` ([Reference](https://raw.githubusercontent.com/react-native-webview/react-native-webview/master/docs/Reference.md)). Loading a local PDF and the worker therefore needs a deliberate setup, for example bundled assets plus bytes passed in as base64 or served from a local origin. That is a prototype question, not a blocker.
- **Memory.** The pdf.js FAQ warns against rendering all pages at once at high resolution: a letter page at 96 DPI needs about 3.5 MB, about 14 MB on HiDPI ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)). Tablet screens are HiDPI, so Page mode must render only visible pages and release others, as desktop does. There is no official Android figure, so real numbers need measurement on a device (**unverified**). pdf.js also supports HTTP range requests for partial loading, but that applies to network sources, not local files ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)).
- **Bridge cost.** `react-native-webview` documents `postMessage` and `injectedJavaScript` but states no size limit for messages ([Reference](https://raw.githubusercontent.com/react-native-webview/react-native-webview/master/docs/Reference.md)). Reflow text for a whole book can be large, so the design should run extraction and the reflow call on one side and send results in chunks. Performance is unmeasured (**unverified**).

## 2. Platform `PdfRenderer` and `androidx.pdf`

Facts from the [PdfRenderer reference](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer) and [PdfRenderer.Page reference](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer.Page):

- `PdfRenderer` exists since API 21 and renders a page to a `Bitmap`. Only one page can be open at a time. The class is thread safe but calls are serialised by an internal lock.
- The class description says it enables "selecting, searching, fast scrolling, annotations, etc. from Android V" (API 35). On API 35, `PdfRenderer.Page` gains `selectContent`, `searchText`, `getTextContents`, `getImageContents`, `getLinkContents`, annotation and form-widget methods. Before API 35 it only renders (`render`, `getWidth`, `getHeight`, `close`).
- The password-aware constructor (`PdfRenderer(fd, LoadParams)`) is API 35. The older constructor throws `SecurityException` if the file requires a password.
- **Text is not positioned.** [`PdfPageTextContent`](https://developer.android.com/reference/android/graphics/pdf/content/PdfPageTextContent) is "a continuous stream of text in a page of a PDF document in the order of viewing", constructed from a single `String text`. It carries no coordinates, font name, size or colour. [`PdfPageImageContent`](https://developer.android.com/reference/android/graphics/pdf/content/PdfPageImageContent) carries an alt text string. Neither can feed `ReflowTextItem`, which needs `x`, `y`, `width`, `fontSize` and style. The positioned data exists only for selection and search results (`PageSelection`, `PageMatchBounds`).
- For Android R to U, the [`PdfRendererPreV`](https://developer.android.com/reference/android/graphics/pdf/PdfRendererPreV) class offers the same family of features ("from Android R till Android U"). It depends on a device SDK extension (see below).
- The renderer reference advises running it in a separate isolated process for untrusted files.
- Licence: platform API, no separate licence to ship. Free to use.

`androidx.pdf` ([release page](https://developer.android.com/jetpack/androidx/releases/pdf)):

- Jetpack library with a viewer fragment, text selection (long-press, drag handles, copy), find in file, password support, two-page layout for large screens, and OCR via a separate artifact.
- Status on the release page on the research date: latest is `1.0.0-beta01` (2026-08-26); no stable release. Release notes say read and render features were backported to `minSdk = 28` and devices with SDK extension below 13; `ImageSelection` needs SDK extension 19.
- It is a viewer UI. I found no documented API that returns per-fragment positioned text with fonts, so it does not meet the reflow need. Its licence text on the release page points to the general Android content licence; check the artifact POM before adoption (**unverified**).

Page-mode quality: bitmap rendering is adequate for fixed pages, and the large-screen layout in `androidx.pdf` targets tablets. The cost is that Page mode and Reflow mode would use two different engines with different text models, so the Last-read position, annotation anchors and reflow offsets that rely on pdf.js text would need a second implementation.

## 3. React Native PDF libraries

| Library | Engine on Android | Text | Licence | Notes |
|---|---|---|---|---|
| [`react-native-pdf`](https://github.com/wonday/react-native-pdf) (wonday) | PdfiumAndroid | README mentions text selection only for iOS (PDFKit, since 7.0.4); nothing for Android | MIT (repo licence field), last push 2026-08-20 | Needs a dev client, not Expo Go; no RTL scrolling on Android; Fabric work in progress per changelog |
| [`react-native-pdf-renderer`](https://github.com/douglasjunior/react-native-pdf-renderer) | Platform `PdfRenderer` | README: "Android renders the PDF page as a full image, it does not support text selection, accessibility, or handling links" | MIT, last push 2026-09-26 | Zooming too far can crash (`maxPageResolution` mitigates); RN 0.71+ |
| [`AndroidPdfViewer`](https://github.com/barteksc/AndroidPdfViewer) (native, not RN) | PdfiumAndroid | Not documented | Apache-2.0, last push 2025-11-07 | README says maintainers are "actively looking for contributors"; 16 KB page size fix noted; RGB_565 by default to save memory |

None of these exposes positioned text, so Reflow would still need a separate extractor. `react-native-webview` ([repo](https://github.com/react-native-webview/react-native-webview), MIT) is the usual way to host pdf.js in React Native.

## 4. Licence check for the rest of the field

- **MuPDF** has strong text and figure extraction but is AGPL-3.0 ([repo licence field](https://github.com/ArtifexSoftware/mupdf)). Free commercial use would require a paid Artifex licence or open-sourcing the app. Excluded by the "free for commercial use" constraint.
- **Pdfium** itself (via `bblanchon/pdfium-binaries`, MIT-labelled repo) is a possible engine but the Android wrappers above do not expose positioned text. Wrapping it ourselves is a native-code project and out of scope for a v1 plan.

## Recommendation for the map

1. **Use pdf.js as the single engine on Android for both Page mode and Reflow mode, hosted in a WebView.** It is the only free option that returns the positioned text and operator list `/core` already consumes, it keeps selection, annotation anchors and Reflow behaviour identical to desktop, and it is Apache-2.0.
2. Do not plan around platform `PdfRenderer` or the RN native renderers for text: on API 21 to 34 they give none, and on API 35 only unpositioned strings.
3. `PdfRenderer` could be kept as an optional fast thumbnail or cover renderer, but desktop already renders covers with pdf.js (`BookCover.tsx`), so that is a later optimisation.
4. Ship the pdf.js legacy build unless a device survey shows the target WebViews are recent.

This choice bears on the stack ticket: any shell that can host a WebView and run the existing TypeScript core works. A React Native shell is not required by the PDF question alone.

## Open questions for a throwaway prototype

- Touch text selection quality over the pdf.js `TextLayer` on a tablet, including handles and the Selection toolbar.
- Memory and time to render a 500+ page or image-heavy PDF on a mid-range tablet, with virtualised pages.
- How to get local file bytes into the WebView (base64, local server, or asset loader) and the worker file loaded, given the default-off file-access flags.
- Cost of the WebView bridge for reflow input (chunk sizes, whether to run `reflow.ts` inside the WebView).
- WebView Chromium version on target devices without Google Play (**unverified**).
