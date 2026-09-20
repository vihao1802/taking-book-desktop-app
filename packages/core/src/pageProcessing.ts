export interface ProcessPagesOptions<T> {
  /** Number of pages, processed as 1..total. */
  total: number;
  /** How many pages may be in flight at once. */
  concurrency: number;
  /** Does the slow, order-independent part of one page (1-based). */
  processPage: (pageNumber: number) => Promise<T>;
  /**
   * Receives each page's result, always in page order and one page at a time,
   * so a caller can append to a growing document without sorting.
   */
  onPage: (pageNumber: number, result: T) => void;
  /** Checked before each page starts; once it returns true no further page is started. */
  isCancelled?: () => boolean;
}

/**
 * Processes pages with bounded concurrency but delivers results in page order.
 * Work that waits on a worker round-trip (text, operator lists) overlaps this
 * way instead of running one page at a time, while a document that streams in
 * still grows from the top: page N is delivered only after pages 1..N-1.
 *
 * Rejects with the first error `processPage` or `onPage` throws, after which no
 * further pages are started; pages already in flight finish unobserved.
 *
 * @returns Resolves once every page has been delivered, or the run was cancelled.
 */
export async function processPagesInOrder<T>(options: ProcessPagesOptions<T>): Promise<void> {
  const { total, concurrency, processPage, onPage, isCancelled = () => false } = options;
  const finished = new Map<number, T>();
  let nextToStart = 1;
  let nextToDeliver = 1;
  let failed = false;

  const deliverReadyPages = (): void => {
    while (finished.has(nextToDeliver)) {
      const result = finished.get(nextToDeliver) as T;
      finished.delete(nextToDeliver);
      onPage(nextToDeliver, result);
      nextToDeliver++;
    }
  };

  const work = async (): Promise<void> => {
    while (!failed && !isCancelled()) {
      const pageNumber = nextToStart++;
      if (pageNumber > total) return;
      try {
        finished.set(pageNumber, await processPage(pageNumber));
        if (!isCancelled()) deliverReadyPages();
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({ length: workerCount }, work));
}
