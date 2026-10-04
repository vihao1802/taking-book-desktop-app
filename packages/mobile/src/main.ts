import { createInMemoryReaderApi } from './in-memory-reader-api';

// The renderer reads window.api when its modules load, so the adapter is
// installed first and the renderer is imported afterwards.
window.api = createInMemoryReaderApi();
await import('@taking-book/renderer/main');
