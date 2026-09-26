import { isOk, type Result } from '@taking-book/core';

/** The parts of a Book a cover is loaded from. */
export interface CoverSource {
  hash: string;
  path: string;
}

export interface CoverLoaderOptions {
  /** Reads a cover saved by an earlier session; null when none is saved. */
  readSaved: (hash: string) => Promise<Result<string | null>>;
  /** Renders a cover from the PDF itself, the expensive path. */
  render: (file: CoverSource) => Promise<string>;
  /** Persists a freshly rendered cover so later sessions skip rendering. */
  save: (hash: string, dataUrl: string) => Promise<void>;
  maxConcurrentRenders: number;
}

export interface CoverLoader {
  /** Resolves to the cover's data URL, sharing one load across callers asking for the same Book. */
  load: (file: CoverSource) => Promise<string>;
  /** The cover already loaded this session, or null. */
  peek: (hash: string) => string | null;
}

/**
 * Creates the cover loader: session cache first, then the saved cover, and
 * only when neither exists a render of the PDF.
 */
export function createCoverLoader(options: CoverLoaderOptions): CoverLoader {
  const cache = new Map<string, string>();
  const inFlight = new Map<string, Promise<string>>();
  const waitingForSlot: Array<() => void> = [];
  let activeRenders = 0;

  // Each render holds a whole PDF and a canvas; hundreds at once (a big
  // import, then opening Library) crashed the renderer, so renders queue.
  async function renderInTurn(file: CoverSource): Promise<string> {
    if (activeRenders < options.maxConcurrentRenders) activeRenders += 1;
    else await new Promise<void>((resolve) => waitingForSlot.push(resolve));
    try {
      return await options.render(file);
    } finally {
      // The slot passes straight to the next waiter, so a newcomer cannot slip in between.
      const next = waitingForSlot.shift();
      if (next) next();
      else activeRenders -= 1;
    }
  }

  async function loadUncached(file: CoverSource): Promise<string> {
    const saved = await options.readSaved(file.hash);
    if (isOk(saved) && saved.data) return saved.data;
    const dataUrl = await renderInTurn(file);
    void options.save(file.hash, dataUrl).catch((error: unknown) => {
      console.error(`Could not save the cover of ${file.hash}`, error);
    });
    return dataUrl;
  }

  function load(file: CoverSource): Promise<string> {
    const cached = cache.get(file.hash);
    if (cached) return Promise.resolve(cached);
    const running = inFlight.get(file.hash);
    if (running) return running;
    const promise = loadUncached(file)
      .then((dataUrl) => {
        cache.set(file.hash, dataUrl);
        return dataUrl;
      })
      .finally(() => inFlight.delete(file.hash));
    inFlight.set(file.hash, promise);
    return promise;
  }

  return { load, peek: (hash) => cache.get(hash) ?? null };
}
