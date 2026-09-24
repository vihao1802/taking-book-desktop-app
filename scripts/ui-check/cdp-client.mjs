// Minimal Chrome DevTools Protocol client over Node's built-in WebSocket, so
// UI checks need no Playwright/Puppeteer install.

export const RENDERER_PORT = 9222;
export const MAIN_PORT = 9229;
const APP_TITLE = 'Taking Book';

/** Finds the debugger WebSocket URL of the app window, or of the main process. */
export async function findTarget(which) {
  const port = which === 'main' ? MAIN_PORT : RENDERER_PORT;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = which === 'main' ? targets[0] : targets.find((t) => t.type === 'page' && t.title === APP_TITLE);
  if (!target) throw new Error(`No ${which} debug target on port ${port}`);
  return target.webSocketDebuggerUrl;
}

/** Opens a CDP session; `send` resolves with the command's result or throws its error. */
export async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`Cannot connect to ${url}`)), { once: true });
  });
  let nextId = 1;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        ws.removeEventListener('message', onMessage);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      };
      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { send, close: () => ws.close() };
}

/** Evaluates `expression` (awaiting promises) and returns its JSON value; throws on a page exception. */
export async function evaluate(session, expression) {
  const result = await session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}
