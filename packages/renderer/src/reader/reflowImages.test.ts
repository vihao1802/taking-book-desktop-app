import { describe, expect, it, vi } from 'vitest';
import type { ReflowImage } from '@taking-book/core';

// reflowImages only needs the numeric OPS constants; pdfjs-dist's full module
// requires DOM globals (DOMMatrix) that Node lacks, so it is stubbed here.
vi.mock('pdfjs-dist', () => ({
  OPS: {
    save: 10,
    restore: 11,
    transform: 12,
    paintImageXObject: 85,
  },
}));

import { extractImagesFromOperatorList, filterBackgroundFigures, getObjectAsync, ImageBitmapDecoder } from './reflowImages';

// Node has neither global. Real ImageBitmap/VideoFrame instances are only
// reachable from a browser's canvas/WebCodecs APIs, so the decoder's type
// guard is exercised here against stand-ins registered under the same names
// it checks `instanceof` against.
class FakeImageBitmap {}
class FakeVideoFrame {
  close() {}
}
(globalThis as unknown as { ImageBitmap: unknown }).ImageBitmap = FakeImageBitmap;
(globalThis as unknown as { VideoFrame: unknown }).VideoFrame = FakeVideoFrame;

/** Numeric OPS constants mirroring the mock above, used to build operator lists. */
const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85 } as const;

/** Builds an operator list from [fn, args] pairs. */
function opList(ops: Array<[number, unknown[]]>): { fnArray: number[]; argsArray: unknown[] } {
  return {
    fnArray: ops.map(([fn]) => fn),
    argsArray: ops.map(([, args]) => args),
  };
}

const PAGE_WIDTH = 600;

describe('extractImagesFromOperatorList', () => {
  it('returns a painted image with its identity-transform bbox (a unit square)', () => {
    const images = extractImagesFromOperatorList(
      opList([[OPS.paintImageXObject, ['img_p0_1', 100, 40]]]),
      0,
      PAGE_WIDTH,
    );
    expect(images).toEqual([
      { pageIndex: 0, pageWidth: PAGE_WIDTH, x: 0, y: -1, width: 1, height: 1, ref: 'img_p0_1' },
    ]);
  });

  it('applies the current transform to position and scale the bbox', () => {
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.transform, [2, 0, 0, 2, 10, 20]],
        [OPS.paintImageXObject, ['img_p0_1', 100, 50]],
      ]),
      0,
      PAGE_WIDTH,
    );
    expect(images[0]).toMatchObject({ x: 10, y: -22, width: 2, height: 2 });
  });

  it('restores the transform on restore, isolating later images', () => {
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.save, []],
        [OPS.transform, [1, 0, 0, 1, 50, 60]],
        [OPS.paintImageXObject, ['img_p0_1', 10, 10]],
        [OPS.restore, []],
        [OPS.paintImageXObject, ['img_p0_2', 10, 10]],
      ]),
      0,
      PAGE_WIDTH,
    );
    expect(images[0]).toMatchObject({ x: 50, y: -61 });
    expect(images[1]).toMatchObject({ x: 0, y: -1 });
  });

  it('computes the axis-aligned bbox for a rotated image', () => {
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.transform, [0, 1, 1, 0, 0, 0]],
        [OPS.paintImageXObject, ['img_p0_1', 100, 50]],
      ]),
      0,
      PAGE_WIDTH,
    );
    expect(images[0]).toMatchObject({ x: 0, y: -1, width: 1, height: 1 });
  });

  it('dedupes repeated paints of the same object on a page', () => {
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.paintImageXObject, ['logo', 20, 20]],
        [OPS.paintImageXObject, ['logo', 20, 20]],
      ]),
      0,
      PAGE_WIDTH,
    );
    expect(images).toHaveLength(1);
  });
});

describe('filterBackgroundFigures', () => {
  const pageArea = 100 * 200;

  function img(pageIndex: number, width: number, height: number, ref = `img${pageIndex}`): ReflowImage {
    return { pageIndex, pageWidth: 100, x: 0, y: 0, width, height, ref };
  }

  it('keeps a full-page image on a page with no text (a cover)', () => {
    const kept = filterBackgroundFigures([img(0, 190, 190)], [pageArea], new Set());
    expect(kept).toHaveLength(1);
  });

  it('drops a full-page image on a page that has text (a background)', () => {
    const kept = filterBackgroundFigures([img(0, 190, 190)], [pageArea], new Set([0]));
    expect(kept).toHaveLength(0);
  });

  it('keeps a small figure even when its page has text', () => {
    const kept = filterBackgroundFigures([img(0, 40, 40)], [pageArea], new Set([0]));
    expect(kept).toHaveLength(1);
  });

  it('keeps images on pages with unknown area', () => {
    const kept = filterBackgroundFigures([img(0, 999, 999)], [], new Set([0]));
    expect(kept).toHaveLength(1);
  });

  it('honours a custom background threshold', () => {
    const kept = filterBackgroundFigures([img(0, 100, 100)], [pageArea], new Set([0]), {
      maxPageAreaRatio: 0.5,
    });
    expect(kept).toHaveLength(0);
  });
});

describe('getObjectAsync', () => {
  it('waits for an object that is not resolved yet, instead of giving up immediately', async () => {
    let pending: (data: unknown) => void = () => {};
    const pool = {
      get: vi.fn((_objId: string, callback?: (data: unknown) => void) => {
        if (callback) pending = callback;
      }),
    };
    const result = getObjectAsync(pool, 'img1', 5000);
    // Simulates pdf.js's worker finishing the decode after the caller already
    // asked for the object -- the exact race a full-page cover image hits.
    pending({ bitmap: 'fake-bitmap' });
    await expect(result).resolves.toEqual({ bitmap: 'fake-bitmap' });
  });

  it('resolves to undefined if the object never resolves within the timeout', async () => {
    vi.useFakeTimers();
    const pool = { get: vi.fn() };
    const result = getObjectAsync(pool, 'missing', 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe('ImageBitmapDecoder.canDecode', () => {
  const decoder = new ImageBitmapDecoder();

  it('accepts an ImageBitmap-backed result (pdf.js\'s canvas decode path)', () => {
    expect(decoder.canDecode({ bitmap: new FakeImageBitmap(), width: 300, height: 200 })).toBe(true);
  });

  it('accepts a VideoFrame-backed result (pdf.js\'s WebCodecs ImageDecoder path, e.g. Electron JPEGs)', () => {
    expect(decoder.canDecode({ bitmap: new FakeVideoFrame(), width: 2400, height: 3600 })).toBe(true);
  });

  it('rejects a result missing width/height', () => {
    expect(decoder.canDecode({ bitmap: new FakeImageBitmap() })).toBe(false);
  });

  it('rejects a bitmap of an unrecognized type', () => {
    expect(decoder.canDecode({ bitmap: {}, width: 300, height: 200 })).toBe(false);
  });

  it('rejects undefined (an object pdf.js has not resolved)', () => {
    expect(decoder.canDecode(undefined)).toBe(false);
  });
});