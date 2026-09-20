import { describe, expect, it } from 'vitest';
import { processPagesInOrder } from '../src/pageProcessing';

/** A promise that settles after `ticks` turns of the event loop, so pages can finish out of order. */
function afterTicks<T>(ticks: number, value: T): Promise<T> {
  let promise = Promise.resolve();
  for (let i = 0; i < ticks; i++) promise = promise.then(() => undefined);
  return promise.then(() => value);
}

describe('processPagesInOrder', () => {
  it('delivers every page exactly once, in page order, even when later pages finish first', async () => {
    const delivered: Array<[number, string]> = [];
    await processPagesInOrder({
      total: 6,
      concurrency: 3,
      // Page 1 is the slowest, so pages 2 and 3 finish before it.
      processPage: (page) => afterTicks(page === 1 ? 20 : 1, `text ${page}`),
      onPage: (page, result) => delivered.push([page, result]),
    });
    expect(delivered.map(([page]) => page)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(delivered.map(([, result]) => result)).toEqual(['text 1', 'text 2', 'text 3', 'text 4', 'text 5', 'text 6']);
  });

  it('never has more pages in flight than the concurrency allows', async () => {
    let inFlight = 0;
    let peak = 0;
    await processPagesInOrder({
      total: 10,
      concurrency: 4,
      processPage: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await afterTicks(3, null);
        inFlight--;
      },
      onPage: () => undefined,
    });
    expect(peak).toBe(4);
  });

  it('really overlaps pages: with concurrency above one the next page starts before the first ends', async () => {
    const started: number[] = [];
    await processPagesInOrder({
      total: 2,
      concurrency: 2,
      processPage: async (page) => {
        started.push(page);
        await afterTicks(5, null);
      },
      onPage: () => undefined,
    });
    expect(started).toEqual([1, 2]);
  });

  it('handles a document with no pages', async () => {
    const delivered: number[] = [];
    await processPagesInOrder({ total: 0, concurrency: 4, processPage: async () => 1, onPage: (page) => delivered.push(page) });
    expect(delivered).toEqual([]);
  });

  it('works with fewer pages than workers', async () => {
    const delivered: number[] = [];
    await processPagesInOrder({ total: 2, concurrency: 8, processPage: async (page) => page, onPage: (page) => delivered.push(page) });
    expect(delivered).toEqual([1, 2]);
  });

  it('stops starting pages once cancelled', async () => {
    const started: number[] = [];
    const delivered: number[] = [];
    let cancelled = false;
    await processPagesInOrder({
      total: 50,
      concurrency: 2,
      isCancelled: () => cancelled,
      processPage: async (page) => {
        started.push(page);
        if (page === 3) cancelled = true;
        await afterTicks(1, null);
      },
      onPage: (page) => delivered.push(page),
    });
    expect(started.length).toBeLessThan(10);
    expect(delivered.every((page) => page <= 3)).toBe(true);
  });

  it('rejects with the error of a failing page and starts no more pages', async () => {
    const started: number[] = [];
    await expect(
      processPagesInOrder({
        total: 50,
        concurrency: 2,
        processPage: async (page) => {
          started.push(page);
          if (page === 2) throw new Error('page 2 is unreadable');
          await afterTicks(1, null);
        },
        onPage: () => undefined,
      }),
    ).rejects.toThrow('page 2 is unreadable');
    expect(started.length).toBeLessThan(10);
  });

  it('rejects when handling a delivered page throws', async () => {
    await expect(
      processPagesInOrder({
        total: 3,
        concurrency: 2,
        processPage: async (page) => page,
        onPage: (page) => {
          if (page === 2) throw new Error('cannot store page 2');
        },
      }),
    ).rejects.toThrow('cannot store page 2');
  });
});
