# Android file access and SQLite driver options

Research date: 2026-10-03. Answers issue #52 (parent map #48). Every external claim cites the first-party page it was read from. Claims marked **UNVERIFIED** could not be confirmed from a primary source in this pass and should be checked before they drive a decision.

## Answer in brief

1. **Import by copying, not by holding a URI.** Open the PDF through the system picker, stream it once to compute the SHA-256 and copy it into app-private storage in the same pass, then key the Book by hash. Never persist the `content://` URI as identity. This matches the repo rule "identify by content hash, never path" and avoids the SAF failure mode where a persisted grant is lost when the document moves.
2. **Share-intent URIs are temporary**, so the copy-on-import flow is mandatory for `ACTION_SEND`, not optional.
3. **Hashing without loading the file:** all three stacks can read a content URI in chunks (expo-file-system `FileHandle.readBytes`, Capacitor `readFileInChunks`, native `ContentResolver.openInputStream`). Feed chunks to `createSha256Hasher()` from `packages/core/src/sha256.ts`. Hash speed of the pure-TypeScript hasher on Hermes is **UNVERIFIED** and needs a throwaway benchmark.
4. **SQLite:** every candidate can implement `SqlDriver`. Best fit is **expo-sqlite** if the stack is Expo/React Native (first-party, Expo Go compatible, async API, transactions), **op-sqlite** if raw performance or SQLCipher matters, and **@capacitor-community/sqlite** if the stack is Capacitor. `react-native-quick-sqlite` is deprecated: do not use it. The `SqlDriver.transaction` contract needs care on every candidate (see below).

## What the code asks of us

- `packages/core/src/sql.ts`: `SqlDriver` has `exec`, `run` (returns `{lastInsertRowid, changes}`), `get`, `all`, and `transaction<T>(fn: () => Promise<T>)`. Values are `string | number | null` only (no blobs, no booleans).
- `packages/core/src/sha256.ts`: pure TypeScript incremental hasher, `update(Uint8Array)` then `digestHex()`. Its header comment already says mobile feeds it "its own byte source". `update` copies the carry-over buffer plus each chunk into a new array, so use chunks that are a multiple of 64 bytes to keep carry-over empty.
- `packages/desktop/src/main/sqliteDriver.ts`: wraps better-sqlite3. It normalises bigint and boolean to numbers and implements `transaction` as `db.transaction(fn)()`. Grounding note: better-sqlite3 transactions are synchronous, so passing an `async` function would commit when the function first returns its promise, not when it settles. **This is an observation from the code only; better-sqlite3 docs were not re-read in this pass, so check before relying on it.** The mobile driver should not copy this pattern.

## Part 1: Reading PDFs on Android

### Picker choice

- Android docs: "Use `ACTION_GET_CONTENT` if you want your app to read or import data ... the app imports a copy of the data." and "Use `ACTION_OPEN_DOCUMENT` if you want your app to have long-term, persistent access to documents owned by a document provider." Source: [Storage Access Framework overview](https://developer.android.com/guide/topics/providers/document-provider).
- Opening a PDF: `Intent.ACTION_OPEN_DOCUMENT` with `CATEGORY_OPENABLE` and `type = "application/pdf"`. No `READ_EXTERNAL_STORAGE` permission is needed. Source: [Access documents and other files](https://developer.android.com/training/data-storage/shared/documents-files).
- Our case is "import": we want a copy we own, so either intent works. `ACTION_OPEN_DOCUMENT` is what the docs show for PDFs and lets the user browse every provider (Drive, SD card).

### Persisted permissions

- "By default, URI permissions last until device restart." To persist: `contentResolver.takePersistableUriPermission(uri, takeFlags)`. Source: [Access documents and other files](https://developer.android.com/training/data-storage/shared/documents-files).
- Same page: persisted permissions are lost if the document is moved or deleted and must be requested again. This is why a persisted URI cannot be a Book's identity or location.
- Document IDs "don't change once issued, since they are used for persistent URI grants across device reboots" ([overview](https://developer.android.com/guide/topics/providers/document-provider)). That is stability across reboots, not across moves by the user.
- The cap on persisted grants per app (commonly cited as 128, higher on newer releases) is **UNVERIFIED**: the ContentResolver reference page did not return usable text through the fetch tool. Not needed if we copy on import.
- Recommendation: do **not** persist URIs for the library. Persist only if we later add "link to original file without copying", which is out of scope for v1.

### Share intent

- Manifest: `<intent-filter>` with `android.intent.action.SEND`, `CATEGORY_DEFAULT`, `<data android:mimeType="application/pdf" />`; read the file from `Intent.EXTRA_STREAM`. Source: [Receive simple data from other apps](https://developer.android.com/training/sharing/receive).
- Same page caveats: the URI permission is temporary (process the data immediately and copy it to persistent storage if needed), binary data must be handled off the main thread, and incoming data (MIME type, size) must be validated.
- Implication: the share handler runs the same import pipeline as the picker (stream, hash, copy). Avoid a `*/*` filter; the docs warn against it unless the app handles any type.

### Hashing without loading into memory

Pipeline: open a content URI as a byte stream, read fixed-size chunks (for example 1 MiB, a multiple of 64), call `hasher.update(chunk)`, write the same chunk to the private copy, then `digestHex()`. Rename the private file to the hash.

| Stack | Chunked read of a `content://` URI | Source |
|---|---|---|
| Native Kotlin | `contentResolver.openInputStream(uri)` or `openFileDescriptor(uri, "r")` | [Access documents and other files](https://developer.android.com/training/data-storage/shared/documents-files) |
| Expo | `new File(safUri)`, `FileHandle.readBytes(length)` reads from the current offset and advances it; `File.copy()` can copy a SAF file into cache. Docs state ReadWrite mode "cannot be used with SAF `content://` URIs" (read is fine). | [expo-file-system](https://docs.expo.dev/versions/latest/sdk/filesystem/) |
| Capacitor | `@capacitor/filesystem` supports "reading `content://` files on Android", `readFileInChunks()`, and `readFile()` with `offset`/`length` (since v8.1.0). Plain `readFile()` returns whole-file base64: avoid it. | [Capacitor Filesystem](https://capacitorjs.com/docs/apis/filesystem) |

Pitfalls found:
- expo-file-system `bytes()` / `arrayBuffer()` load the whole file into memory: do not use them for hashing.
- expo-file-system exposes an `md5` property on `File`, marked deprecated; MD5 only, so it cannot replace our SHA-256 identity.
- expo-document-picker defaults `copyToCacheDirectory` to `true` (the picked file is copied into the cache); it can be disabled "for performance with large files". The docs do not say which intent it uses nor whether it returns `content://` or `file://` (**UNVERIFIED**; read the source before relying on either). Source: [expo-document-picker](https://docs.expo.dev/versions/latest/sdk/document-picker/). A default-on copy plus our own copy would double the disk writes for a large PDF.
- The pure-TS hasher is correct and shared (good for the "one hash function" rule) but its throughput on Hermes for 100+ MB PDFs is unknown. If too slow, a native hash module could sit behind the same `Sha256Hasher` interface in a platform package (AGENTS.md: shared interface + platform implementations). Do not decide without a benchmark.

## Part 2: SQLite drivers behind `SqlDriver`

SQLite itself: transactions are ACID and durable across crashes ([sqlite.org/transactional](https://www.sqlite.org/transactional.html)), so any driver that issues real BEGIN/COMMIT/ROLLBACK suffices for sync and annotation writes.

### Candidates

| Driver | Stack | Licence | Status | API that maps to `SqlDriver` |
|---|---|---|---|---|
| expo-sqlite | Expo / RN | **UNVERIFIED** (not read) | First-party Expo module | `execAsync`, `runAsync` returns `{lastInsertRowId, changes}`, `getFirstAsync`, `getAllAsync`, `withTransactionAsync`, `withExclusiveTransactionAsync` |
| op-sqlite | RN (JSI) | MIT | Active, latest release read: 18.2.5 (September 20) | `execute`, `executeBatch`, `transaction((tx) => ...)`, prepared statements |
| react-native-nitro-sqlite | RN (Nitro) | MIT | Active; needs RN 0.75+ and `react-native-nitro-modules` 0.37.1+ | `execute`, `transaction`, `open` |
| react-native-quick-sqlite | RN | not shown on repo page | **Deprecated** in favour of nitro-sqlite; only 8.x bug fixes | n/a |
| @capacitor-community/sqlite | Capacitor | MIT | Active (README badge says maintained 2026) | `execute`, `executeSet`, `query`, `run`, `beginTransaction`/`commitTransaction`/`rollbackTransaction` |

Sources: [expo-sqlite docs](https://docs.expo.dev/versions/latest/sdk/sqlite/), [op-sqlite repo](https://github.com/OP-Engineering/op-sqlite), [op-sqlite API docs](https://op-engineering.github.io/op-sqlite/docs/api), [op-sqlite releases](https://github.com/OP-Engineering/op-sqlite/releases), [react-native-nitro-sqlite](https://github.com/margelo/react-native-nitro-sqlite), [react-native-quick-sqlite](https://github.com/margelo/react-native-quick-sqlite), [capacitor-community/sqlite](https://github.com/capacitor-community/sqlite).

### Fit against each `SqlDriver` method

- **`run` result.** expo-sqlite returns `lastInsertRowId` and `changes` directly. op-sqlite's batch result mentions `rowsAffected`; the `execute` result shape (including the insert id field) was not spelled out on the API page (**UNVERIFIED**; check the package types before writing the adapter).
- **Parameter and value types.** expo-sqlite binds strings, numbers, null, booleans and `Uint8Array`. op-sqlite binds arrays plus typed arrays for blobs. `SqlValue` is only `string | number | null`, so any of them fits. As on desktop, normalise booleans to 0/1 on read.
- **`exec`.** expo-sqlite `execAsync` runs bulk SQL without parameter escaping, which is right for migrations.
- **`transaction`.** This is the contract risk.
  - expo-sqlite: `withTransactionAsync` includes any query that runs while the transaction is active, even from outside the callback ("any query that runs while the transaction is active will be included in the transaction"). `withExclusiveTransactionAsync` scopes it properly, but other writes can fail with "database is locked". `SqlDriver.transaction` takes a callback with no `tx` argument, so repositories call the shared driver inside it; with the non-exclusive variant that is exactly the interleaving the docs warn about. Mitigations: serialise writes through a driver-level queue/mutex, or change `SqlDriver.transaction` to hand a scoped driver to the callback.
  - op-sqlite: the callback receives `tx`, and an error thrown in the body rolls back; repositories would need the scoped `tx` to be safe.
  - Capacitor: explicit begin/commit/rollback calls, so the adapter owns try/catch/rollback; same interleaving risk if other calls arrive mid-transaction.
  - For the spec: either keep `transaction(fn)` and add a write mutex in the mobile adapter (smallest change, core untouched), or change the interface (touches every repository and the desktop driver).
- **Performance.** op-sqlite's README includes benchmark images but no numbers were extractable (**UNVERIFIED**). expo-sqlite docs recommend WAL ("to improve performance in general") and warn that its sync API can block the JavaScript thread. Our workload (library list, annotations, per-page position writes) is small, and no source found says expo-sqlite is too slow for it. A throwaway benchmark of 1k inserts in a transaction on a low-end device would settle it.
- **Extras.** expo-sqlite: SQLCipher not supported in Expo Go; config plugin supports FTS3/4/5 (default on) and LibSQL. op-sqlite: SQLCipher, FTS5, sqlite-vec, reactive queries. The Capacitor plugin uses SQLCipher on Android and its README carries a note about US encryption export self-classification reporting. We need none of these for v1, so prefer the option without the export-compliance note.

### Licences and the "free only" constraint

All candidates are free to use. MIT was read directly for op-sqlite, nitro-sqlite and the Capacitor plugin. The expo-sqlite licence text was not read in this pass. No paid service is needed by any of them.

## Recommendation for the stack tickets (#53, #56)

- If React Native with Expo: expo-sqlite + expo-file-system (`File`/`FileHandle`) + a custom share intent filter (config plugin) + the existing core hasher. Fewest moving parts; op-sqlite is the upgrade path if benchmarking demands it, with the same `SqlDriver` adapter shape.
- If Capacitor: @capacitor-community/sqlite + `@capacitor/filesystem` `readFileInChunks`, accepting the SQLCipher export note.
- Either way: copy-on-import with a streaming hash, no persisted URIs, one write-serialisation decision for `SqlDriver.transaction`.

## Open items to verify before the spec is final

- Hasher throughput on Hermes (or the Capacitor WebView) for a 100 MB+ PDF.
- Persisted URI grant cap (only matters if we ever keep original URIs).
- expo-document-picker intent and URI scheme; expo-sqlite licence text; op-sqlite `execute` result field names.
- Whether the desktop `transaction` wrapper tolerates async callbacks (see grounding note).
