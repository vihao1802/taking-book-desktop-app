import { startReaderApi } from './start-reader-api';

/** Shows a start-up failure in place of the app, since nothing else can render without a database. */
function showStartupError(message: string): void {
  console.error(`The app could not start: ${message}`);
  const container = document.getElementById('root');
  if (!container) return;
  const notice = document.createElement('p');
  notice.className = 'startup-error';
  notice.textContent = `Taking Book could not start: ${message}`;
  container.replaceChildren(notice);
}

async function startApp(): Promise<void> {
  const started = await startReaderApi();
  if (!started.ok) {
    showStartupError(started.error);
    return;
  }
  // The renderer reads window.api when its modules load, so the adapter is
  // installed first and the renderer is imported afterwards.
  window.api = started.data;
  await import('@taking-book/renderer/main');
}

// Set only by scripts/device-check.mjs; the constant is false in every other build, so the check is dropped.
if (import.meta.env.VITE_TB_DEVICE_CHECK) {
  const { runDeviceCheck } = await import('./device-check');
  await runDeviceCheck();
} else {
  await startApp();
}
