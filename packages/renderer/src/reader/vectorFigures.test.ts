import { describe, expect, it, vi } from 'vitest';
import type { ReflowTextItem } from '@taking-book/core';

// Numeric OPS constants mirroring pdf.js; the full module needs DOM globals
// that Node lacks, so it is stubbed (same approach as reflowImages.test.ts).
vi.mock('pdfjs-dist', () => ({
  OPS: {
    save: 10,
    restore: 11,
    transform: 12,
    paintImageXObject: 85,
    constructPath: 91,
    stroke: 20,
    closeStroke: 21,
    fill: 22,
    eoFill: 23,
    fillStroke: 24,
    eoFillStroke: 25,
    closeFillStroke: 26,
    closeEOFillStroke: 27,
    endPath: 28,
  },
}));

import {
  dropTextInsideFigures,
  extractVectorFiguresFromOperatorList,
  parseVectorFigureRef,
  vectorFigureRef,
} from './vectorFigures';

const OPS = { save: 10, restore: 11, transform: 12, constructPath: 91, stroke: 20, endPath: 28, fill: 22 } as const;
const PAGE = { width: 500, height: 700 };

const MOVE = 0;
const LINE = 1;
const CURVE = 2;

/** A pdf.js-shaped `constructPath` op: [paint op, [typed-array chunk], bbox]. */
function path(paintOp: number, segments: number[]): [number, unknown[]] {
  return [OPS.constructPath, [paintOp, [segments], []]];
}

function opList(ops: Array<[number, unknown[]]>): { fnArray: number[]; argsArray: unknown[] } {
  return { fnArray: ops.map(([fn]) => fn), argsArray: ops.map(([, args]) => args) };
}

/** A 300x100 rectangle from origin (as four axis-aligned strokes). */
const RECTANGLE = [MOVE, 0, 0, LINE, 300, 0, LINE, 300, 100, LINE, 0, 100, LINE, 0, 0];
/** A curved arrow inside it. */
const CURVED_ARROW = [MOVE, 20, 20, CURVE, 60, 80, 120, 80, 160, 20];

describe('extractVectorFiguresFromOperatorList', () => {
  it('finds a cluster of paths containing a curve and returns it as a top-down figure', () => {
    const figures = extractVectorFiguresFromOperatorList(
      opList([
        [OPS.transform, [1, 0, 0, 1, 100, 400]],
        path(OPS.stroke, RECTANGLE),
        path(OPS.stroke, CURVED_ARROW),
      ]),
      3,
      PAGE,
    );
    expect(figures).toHaveLength(1);
    // Page space y grows up: the box spans y 400..500, so its top edge is -502 with 2pt padding.
    expect(figures[0]).toMatchObject({ pageIndex: 3, pageWidth: 500, x: 98, y: -502, width: 304, height: 104 });
  });

  it('treats a diagonal line (an arrowhead or arrow) as diagram-like', () => {
    const arrowhead = [MOVE, 150, 50, LINE, 170, 60, LINE, 150, 70];
    const figures = extractVectorFiguresFromOperatorList(
      opList([path(OPS.stroke, RECTANGLE), path(OPS.fill, arrowhead)]),
      0,
      PAGE,
    );
    expect(figures).toHaveLength(1);
  });

  it('leaves axis-aligned rules and ruled tables alone', () => {
    expect(extractVectorFiguresFromOperatorList(opList([path(OPS.stroke, RECTANGLE)]), 0, PAGE)).toEqual([]);
  });

  it('ignores clip-only paths, which are never painted', () => {
    expect(extractVectorFiguresFromOperatorList(opList([path(OPS.endPath, CURVED_ARROW)]), 0, PAGE)).toEqual([]);
  });

  it('drops drawings too small to be a figure', () => {
    const tiny = [MOVE, 0, 0, CURVE, 5, 10, 10, 10, 15, 0];
    expect(extractVectorFiguresFromOperatorList(opList([path(OPS.stroke, tiny)]), 0, PAGE)).toEqual([]);
  });

  it('drops a region covering most of the page, whose text must stay text', () => {
    const frame = [MOVE, 0, 0, LINE, 480, 20, LINE, 480, 680, LINE, 0, 680];
    expect(extractVectorFiguresFromOperatorList(opList([path(OPS.stroke, frame)]), 0, PAGE)).toEqual([]);
  });

  it('keeps separate drawings apart', () => {
    const figures = extractVectorFiguresFromOperatorList(
      opList([
        path(OPS.stroke, CURVED_ARROW),
        [OPS.transform, [1, 0, 0, 1, 0, 300]],
        path(OPS.stroke, [MOVE, 0, 0, CURVE, 40, 90, 200, 90, 240, 0]),
      ]),
      0,
      PAGE,
    );
    expect(figures).toHaveLength(2);
  });

  it('restores the transform on restore', () => {
    const figures = extractVectorFiguresFromOperatorList(
      opList([
        [OPS.save, []],
        [OPS.transform, [1, 0, 0, 1, 0, 500]],
        [OPS.restore, []],
        path(OPS.stroke, [MOVE, 0, 0, CURVE, 40, 90, 200, 90, 240, 0]),
      ]),
      0,
      PAGE,
    );
    // The +500 translate was restored, so the curve (control points up to y=90) sits at page origin.
    expect(figures[0].y).toBe(-92);
  });
});

describe('vector figure refs', () => {
  it('round-trips a region', () => {
    const region = { x: 70, y: -536.5, width: 364.5, height: 139.6 };
    expect(parseVectorFigureRef(vectorFigureRef(region))).toEqual(region);
  });

  it('returns null for a pdf.js image object id', () => {
    expect(parseVectorFigureRef('img_p0_1')).toBeNull();
  });
});

describe('dropTextInsideFigures', () => {
  function item(str: string, x: number, y: number): ReflowTextItem {
    return { str, x, y, width: str.length * 5, fontSize: 10 };
  }
  const figure = { x: 70, y: -500, width: 300, height: 100 };

  it('drops labels inside a figure and keeps the caption below it', () => {
    const kept = dropTextInsideFigures(
      [item('users table', 100, -450), item('Figure 1-2. Caption', 72, -390)],
      [figure],
    );
    expect(kept.map((entry) => entry.str)).toEqual(['Figure 1-2. Caption']);
  });

  it('returns the items untouched when the page has no figures', () => {
    const items = [item('body', 0, 0)];
    expect(dropTextInsideFigures(items, [])).toBe(items);
  });
});
