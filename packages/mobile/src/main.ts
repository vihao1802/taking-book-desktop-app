import { startReaderApi } from './start-reader-api';

/** Shows a start-up failure in place of the app, since nothing else can render without a database. */
function showStartupError(error: unknown): void {
  console.error('The app could not start:', error);
  const container = document.getElementById('root');
  if (!container) return;
  const message = document.createElement('p');
  message.style.padding = '24px';
  message.textContent = `Taking Book could not open its database: ${error instanceof Error ? error.message : String(error)}`;
  container.replaceChildren(message);
}

// The renderer reads window.api when its modules load, so the adapter is
// installed first and the renderer is imported afterwards.
try {
  window.api = await startReaderApi();
  await import('@taking-book/renderer/main');
} catch (error) {
  showStartupError(error);
}
