# Google Drive OAuth — PKCE Sequence Diagram

Actual flow implemented in `packages/desktop/src/main/cloud/googleDrive.ts`
(`runLoopbackOAuth`) and `packages/core/src/sync/cloud.ts`. The loopback
server binds to `http://127.0.0.1:<random-port>` (loopback IP literal per
RFC 8252 §7.3, so any port is accepted); the `code_verifier` is generated in
the main-process closure before the browser opens and is never persisted — it
exists only for the duration of the exchange. The redirect target page is
rendered by `packages/desktop/src/main/cloud/oauthLandingPage.ts`.

```mermaid
sequenceDiagram
    autonumber
    participant App as Desktop App (main process)
    participant Browser as System Browser
    participant Google as Google OAuth Server

    Note over App: connect() called (cloud:connect IPC)

    App->>App: start loopback server on 127.0.0.1 random-port
    App->>App: generate code_verifier (32 random bytes, base64url) kept only in memory
    App->>App: derive code_challenge = S256(code_verifier)
    App->>App: build auth URL with state, code_challenge and method S256

    App->>Browser: openExternal(auth URL)
    Browser->>Google: GET /o/oauth2/v2/auth
    Note over Google: user signs in and approves
    Google-->>Browser: 302 redirect to loopback with code and state

    Browser->>App: HTTP GET code and state to loopback server
    App->>App: render success/error landing page, close server, extract code
    App->>App: validate state === expected state (else error)
    App->>App: extract authorization code
    App->>App: close loopback server (success path)

    App->>Google: POST /token with code, redirect_uri, client_id, client_secret, code_verifier
    Google-->>App: 200 with access_token, refresh_token, expires_in

    App->>Google: GET /oauth2/v2/userinfo (Bearer access_token)
    Google-->>App: 200 with name, email
    App->>App: store encrypted token and account (safeStorage) in settings table
    App-->>App: connect() returns account to renderer

    rect rgb(255, 240, 240)
        Note over App: Failure paths
        App->>App: browser open fails - stop loopback server, return error
        App->>App: state mismatch or no code - stop loopback server, return error
        App->>App: timeout (5 min) - stop loopback server, return try again
        App->>Google: token exchange fails (HTTP 4xx)
        Google-->>App: 400 error response
        App->>App: return error, user can click Connect again (fresh verifier)
    end
```

Refresh flow (`freshToken` / `refreshTokenFromStore` in
`packages/desktop/src/main/cloud/googleDrive.ts`) reuses the stored refresh
token; the access token is only kept for `expiresAt - 60s` skew before a
refresh is triggered:

```mermaid
sequenceDiagram
    autonumber
    participant App as Desktop App
    participant Google as Google OAuth Server

    App->>App: read stored token, expired within 60s skew
    alt token still valid
        App-->>App: use cached access token
    else needs refresh
        App->>Google: POST /token with refresh_token, client_id, client_secret
        Google-->>App: 200 with access_token, expires_in
        App->>App: store new token (same account)
    end
```

## Notes

- **`drive.file` scope only** — the app can only see its own files/folders.
- **PKCE** satisfies OAuth 2.1 best practice; the loopback redirect keeps the
  code exchange inside the app's own local server.
- **`client_secret` is still sent** on exchange/refresh because Google's
  token endpoint requires it for Desktop clients even with PKCE; Google treats
  desktop client secrets as non-confidential (they ship in the app).
- **`code_verifier` is ephemeral**: generated per flow, held in the
  `runLoopbackOAuth` closure, never written to disk, discarded after exchange.
