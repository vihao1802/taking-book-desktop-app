import { createHarnessReaderApi } from './harness-reader-api';

// Same order as the Android entry: the renderer reads window.api when its modules load.
window.api = createHarnessReaderApi();
await import('@taking-book/renderer/main');
