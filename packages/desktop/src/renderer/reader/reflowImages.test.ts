import { describe, expect, it, vi } from 'vitest';

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

import { extractImagesFromOperatorList } from './reflowImages';

/** Numeric OPS constants mirroring the mock above, used to build operator lists. */
const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85 } as const;

/** Builds an operator list from [fn, args] pairs. */
function opList(ops: Array<[number, unknown[]]>): { fnArray: number[]; argsArray: unknown[] } {
  return {
    fnArray: ops.map(([fn]) => fn),
    argsArray: ops.map(([, args]) => args),
  };
}

describe('extractImagesFromOperatorList', () => {
  it('returns a painted image with its identity-transform bbox', () => {
    const images = extractImagesFromOperatorList(
      opList([[OPS.paintImageXObject, ['img_p0_1', 100, 40]]]),
      0,
      100000,
    );
    expect(images).toEqual([
      { pageIndex: 0, x: 0, y: 0, width: 100, height: 40, ref: 'img_p0_1' },
    ]);
  });

  it('applies the current transform to position and scale the bbox', () => {
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.transform, [2, 0, 0, 2, 10, 20]],
        [OPS.paintImageXObject, ['img_p0_1', 100, 50]],
      ]),
      0,
      100000,
    );
    expect(images[0]).toMatchObject({ x: 10, y: 20, width: 200, height: 100 });
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
      100000,
    );
    expect(images[0]).toMatchObject({ x: 50, y: 60 });
    expect(images[1]).toMatchObject({ x: 0, y: 0 });
  });

  it('computes the axis-aligned bbox for a rotated image', () => {
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.transform, [0, 1, 1, 0, 0, 0]],
        [OPS.paintImageXObject, ['img_p0_1', 100, 50]],
      ]),
      0,
      100000,
    );
    expect(images[0]).toMatchObject({ x: 0, y: 0, width: 50, height: 100 });
  });

  it('dedupes repeated paints of the same object on a page', () => {
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.paintImageXObject, ['logo', 20, 20]],
        [OPS.paintImageXObject, ['logo', 20, 20]],
      ]),
      0,
      100000,
    );
    expect(images).toHaveLength(1);
  });

  it('drops full-page background images but keeps smaller figures', () => {
    const pageArea = 100 * 200;
    const images = extractImagesFromOperatorList(
      opList([
        [OPS.paintImageXObject, ['bg', 190, 190]],
        [OPS.paintImageXObject, ['fig', 40, 40]],
      ]),
      0,
      pageArea,
    );
    expect(images.map((img) => img.ref)).toEqual(['fig']);
  });

  it('honours a custom background threshold', () => {
    const pageArea = 100 * 200;
    const images = extractImagesFromOperatorList(
      opList([[OPS.paintImageXObject, ['half', 100, 100]]]),
      0,
      pageArea,
      { maxPageAreaRatio: 0.5 },
    );
    expect(images).toHaveLength(0);
  });
});