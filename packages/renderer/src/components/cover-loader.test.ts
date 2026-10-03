import { describe, expect, it } from 'vitest';
import { ok, type Result } from '@taking-book/core';
import { createCoverLoader, type CoverSource } from './cover-loader';

function book(n: number): CoverSource {
  return { hash: `h${n}`, path: `/store/h${n}` };
}

/** A render that finishes only when the test releases it, so concurrency can be observed. */
function controlledRender() {
  let active = 0;
  let peak = 0;
  const pending: Array<() => void> = [];
  const render = (file: CoverSource): Promise<string> => {
    active += 1;
    peak = Math.max(peak, active);
    return new Promise((resolve) => {
      pending.push(() => {
        active -= 1;
        resolve(`data:${file.hash}`);
      });
    });
  };
  const releaseAll = async (): Promise<void> => {
    while (pending.length > 0) {
      pending.shift()?.();
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { render, releaseAll, peak: () => peak, calls: () => active };
}

const nothingSaved = async (): Promise<Result<string | null>> => ok(null);
const noSave = async (): Promise<void> => undefined;

describe('createCoverLoader', () => {
  // Regression: a Library of 400 uncached Books started ~400 pdf.js renders at once and crashed the renderer.
  it('renders at most maxConcurrentRenders covers at once, however many are requested', async () => {
    const renderer = controlledRender();
    const loader = createCoverLoader({ readSaved: nothingSaved, render: renderer.render, save: noSave, maxConcurrentRenders: 3 });

    const loads = Array.from({ length: 400 }, (_, i) => loader.load(book(i)));
    await new Promise((r) => setTimeout(r, 0));
    expect(renderer.calls()).toBe(3);

    await renderer.releaseAll();
    await expect(Promise.all(loads)).resolves.toHaveLength(400);
    expect(renderer.peak()).toBe(3);
  });

  it('shares one load between callers asking for the same Book', async () => {
    let renders = 0;
    const loader = createCoverLoader({
      readSaved: nothingSaved,
      render: async (file) => {
        renders += 1;
        return `data:${file.hash}`;
      },
      save: noSave,
      maxConcurrentRenders: 3,
    });

    const [a, b] = await Promise.all([loader.load(book(1)), loader.load(book(1))]);
    expect([a, b]).toEqual(['data:h1', 'data:h1']);
    expect(renders).toBe(1);
    expect(loader.peek('h1')).toBe('data:h1');
  });

  it('uses a saved cover without rendering, and saves a freshly rendered one', async () => {
    const saved: string[] = [];
    let renders = 0;
    const loader = createCoverLoader({
      readSaved: async (hash) => ok(hash === 'h1' ? 'data:saved' : null),
      render: async (file) => {
        renders += 1;
        return `data:${file.hash}`;
      },
      save: async (hash) => {
        saved.push(hash);
      },
      maxConcurrentRenders: 3,
    });

    expect(await loader.load(book(1))).toBe('data:saved');
    expect(await loader.load(book(2))).toBe('data:h2');
    expect(renders).toBe(1);
    expect(saved).toEqual(['h2']);
  });

  it('frees a render slot when a render fails, and lets the Book be retried', async () => {
    let attempts = 0;
    const loader = createCoverLoader({
      readSaved: nothingSaved,
      render: async (file) => {
        attempts += 1;
        if (attempts === 1) throw new Error('broken PDF');
        return `data:${file.hash}`;
      },
      save: noSave,
      maxConcurrentRenders: 1,
    });

    await expect(loader.load(book(1))).rejects.toThrow('broken PDF');
    await expect(loader.load(book(2))).resolves.toBe('data:h2');
    await expect(loader.load(book(1))).resolves.toBe('data:h1');
  });
});
