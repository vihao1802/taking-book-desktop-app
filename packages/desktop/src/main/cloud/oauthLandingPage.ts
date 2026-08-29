const AUTO_CLOSE_MS = 3000;
const SUCCESS_TITLE = 'Connected to Google Drive';
const ERROR_TITLE = 'Connection failed';

export type OAuthLandingState = 'success' | 'error';

export interface OAuthLandingPageInput {
  state: OAuthLandingState;
  message?: string;
}

/** Inline CSS for the loopback result page; self-contained so no asset fetch is needed. */
const PAGE_STYLE = `
  :root {
    color-scheme: light dark;
    --bg: #faf9f7;
    --panel: #ffffff;
    --ink: #161616;
    --muted: #727577;
    --border: #e2e3e4;
    --brand: #0a6cff;
    --brand-fg: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #131313;
      --panel: #211e19;
      --ink: #f0ece4;
      --muted: #a8a29a;
      --border: #35302a;
      --brand: #4da3ff;
      --brand-fg: #171512;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    max-width: 420px;
    margin: 24px;
    padding: 40px 32px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panel);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
    text-align: center;
  }
  .icon { width: 56px; height: 56px; margin: 0 auto 20px; border-radius: 50%; display: grid; place-items: center; }
  .icon-success { background: rgba(31, 157, 97, 0.15); color: #1f9d61; }
  .icon-error { background: rgba(251, 44, 54, 0.12); color: #fb2c36; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
  p { font-size: 14px; line-height: 1.5; color: var(--muted); margin: 0 0 24px; }
  button {
    appearance: none;
    border: 0;
    padding: 10px 18px;
    border-radius: 9999px;
    background: var(--brand);
    color: var(--brand-fg);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  button:hover { filter: brightness(1.08); }
`;

/**
 * Renders the browser page shown after the Google consent screen redirects
 * back to the app's loopback server. `success` tells the user to return to the
 * app and auto-closes; `error` shows the failure reason without auto-closing.
 */
export function renderOAuthResultPage(input: OAuthLandingPageInput): string {
  const isSuccess = input.state === 'success';
  const message = isSuccess
    ? 'You can close this tab and return to Taking Book.'
    : escapeHtml(input.message ?? 'Something went wrong during sign-in.');
  const icon = isSuccess
    ? '<svg class="icon icon-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
    : '<svg class="icon icon-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  const autoClose = isSuccess
    // The tab is opened by the system browser, not by this page's script, so
    // browsers may block window.close(); the button and subtitle are the
    // reliable fallback, this is just a best-effort convenience.
    ? `<script>setTimeout(function () { window.close(); }, ${AUTO_CLOSE_MS});</script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${isSuccess ? SUCCESS_TITLE : ERROR_TITLE} — Taking Book</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <main class="card" role="status" aria-live="polite">
    ${icon}
    <h1>${isSuccess ? SUCCESS_TITLE : ERROR_TITLE}</h1>
    <p>${message}</p>
    <button onclick="window.close()">Close this tab</button>
  </main>
  ${autoClose}
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}