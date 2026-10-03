import { OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { ReflowImage, ReflowTextItem } from '@taking-book/core';
import { multiply, transformPoint, type ReflowOperatorList } from './reflowImages';

/**
 * Vector figures: diagrams a PDF draws with path operators instead of embedding
 * a bitmap (charts, schemas, flow drawings). They have no image object to
 * extract, and their labels are ordinary text, so reflow would dump the labels
 * into the reading flow as garbage. Instead the drawing's region is found from
 * the operator list, rendered from the page on demand, and the text inside it
 * is dropped from the flow.
 */

/** pdf.js path segment codes inside a `constructPath` data array. */
const SEGMENT_MOVE = 0;
const SEGMENT_LINE = 1;
const SEGMENT_CURVE = 2;
const SEGMENT_QUADRATIC = 3;

/** Path operators that paint (stroke and/or fill); `endPath` only builds a clip. */
const PAINTING_OPS: ReadonlySet<number> = new Set([
  OPS.stroke,
  OPS.closeStroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
  OPS.eoFillStroke,
  OPS.closeFillStroke,
  OPS.closeEOFillStroke,
]);

/** Paths closer than this (pt) belong to the same drawing. */
const CLUSTER_MARGIN_PT = 6;
/** A line counts as diagonal when both its extents exceed this (pt). */
const DIAGONAL_TOLERANCE_PT = 0.5;
/** Smallest figure, as a share of the page width, and in pt of height. */
const MIN_WIDTH_RATIO = 0.15;
const MIN_HEIGHT_PT = 30;
/**
 * A region covering more than this share of the page is a frame, background or
 * slide layout rather than a figure. Hiding its text would delete the page's
 * content, so such a region is left alone and its text stays text.
 */
const MAX_PAGE_AREA_RATIO = 0.5;
/** Breathing room (pt) so stroke widths at the edge are not clipped. */
const REGION_PADDING_PT = 2;

const REF_PREFIX = 'vector:';

/** A rectangle in the reflow engine's top-down convention (`y` is the top edge). */
export interface FigureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PaintedPath {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Curves and diagonal lines mark a drawing; axis-aligned strokes are also table rules. */
  isDiagramLike: boolean;
}

/**
 * Bounding box (page space, y up) and shape of one path, or null when it has
 * no points. pdf.js hands the path over as a list of typed-array chunks.
 */
function measurePath(chunks: ArrayLike<ArrayLike<number>>, matrix: readonly number[]): PaintedPath | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let isDiagramLike = false;
  let previous: [number, number] | null = null;

  const visit = (x: number, y: number, isLine: boolean): void => {
    const [px, py] = transformPoint(matrix, x, y);
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
    if (
      isLine &&
      previous &&
      Math.abs(px - previous[0]) > DIAGONAL_TOLERANCE_PT &&
      Math.abs(py - previous[1]) > DIAGONAL_TOLERANCE_PT
    ) {
      isDiagramLike = true;
    }
    previous = [px, py];
  };

  for (let chunk = 0; chunk < chunks.length; chunk++) {
    const data = chunks[chunk];
    let i = 0;
    while (i < data.length) {
      const code = data[i];
      if (code === SEGMENT_MOVE || code === SEGMENT_LINE) {
        visit(data[i + 1], data[i + 2], code === SEGMENT_LINE);
        i += 3;
      } else if (code === SEGMENT_CURVE) {
        visit(data[i + 1], data[i + 2], false);
        visit(data[i + 3], data[i + 4], false);
        visit(data[i + 5], data[i + 6], false);
        isDiagramLike = true;
        i += 7;
      } else if (code === SEGMENT_QUADRATIC) {
        visit(data[i + 1], data[i + 2], false);
        visit(data[i + 3], data[i + 4], false);
        isDiagramLike = true;
        i += 5;
      } else {
        i += 1;
      }
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY, isDiagramLike };
}

/** Every painted path on a page, in page space, tracking the current transform. */
function collectPaintedPaths(opList: ReflowOperatorList): PaintedPath[] {
  const paths: PaintedPath[] = [];
  const stack: number[][] = [[1, 0, 0, 1, 0, 0]];
  const { fnArray, argsArray } = opList;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === OPS.save) {
      stack.push([...stack[stack.length - 1]]);
    } else if (fn === OPS.restore) {
      if (stack.length > 1) stack.pop();
    } else if (fn === OPS.transform) {
      const m = argsArray[i] as number[] | undefined;
      if (m && m.length === 6) stack[stack.length - 1] = multiply(stack[stack.length - 1], m);
    } else if (fn === OPS.constructPath) {
      const [paintOp, chunks] = argsArray[i] as [number, ArrayLike<ArrayLike<number>>];
      if (!PAINTING_OPS.has(paintOp)) continue;
      const path = measurePath(chunks, stack[stack.length - 1]);
      if (path) paths.push(path);
    }
  }
  return paths;
}

interface PathGroup {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  isDiagramLike: boolean;
}

function touches(a: PathGroup, b: PathGroup): boolean {
  return (
    a.minX <= b.maxX + CLUSTER_MARGIN_PT &&
    b.minX <= a.maxX + CLUSTER_MARGIN_PT &&
    a.minY <= b.maxY + CLUSTER_MARGIN_PT &&
    b.minY <= a.maxY + CLUSTER_MARGIN_PT
  );
}

/**
 * Merges paths that touch (within the margin) into drawings. Sweeps in x order
 * so a page with thousands of paths does not compare every pair, and repeats
 * until stable because a late path can bridge two groups that were separate.
 */
function clusterPaths(paths: PaintedPath[]): PathGroup[] {
  let groups: PathGroup[] = [...paths].sort((a, b) => a.minX - b.minX);
  let merged = true;
  while (merged) {
    merged = false;
    const next: PathGroup[] = [];
    for (const group of groups) {
      const target = next.find((other) => touches(other, group));
      if (target) {
        target.minX = Math.min(target.minX, group.minX);
        target.minY = Math.min(target.minY, group.minY);
        target.maxX = Math.max(target.maxX, group.maxX);
        target.maxY = Math.max(target.maxY, group.maxY);
        target.isDiagramLike = target.isDiagramLike || group.isDiagramLike;
        merged = true;
      } else {
        next.push({ ...group });
      }
    }
    groups = next;
  }
  return groups;
}

/** Encodes a region as the opaque `ref` a `ReflowImage` carries. */
export function vectorFigureRef(region: FigureRegion): string {
  return `${REF_PREFIX}${region.x}:${region.y}:${region.width}:${region.height}`;
}

/** Decodes a ref made by `vectorFigureRef`; null for anything else (e.g. a pdf.js image id). */
export function parseVectorFigureRef(ref: string): FigureRegion | null {
  if (!ref.startsWith(REF_PREFIX)) return null;
  const [x, y, width, height] = ref.slice(REF_PREFIX.length).split(':').map(Number);
  if ([x, y, width, height].some((value) => !Number.isFinite(value))) return null;
  return { x, y, width, height };
}

/**
 * Finds the drawings on a page: clusters of painted paths that contain a curve
 * or a diagonal line (arrows, arrowheads, rounded shapes) and are large enough
 * to be a figure. Plain rectangles and axis-aligned rules are deliberately
 * left alone: those are ruled tables and underlines, whose text should stay
 * text. Each result is a `ReflowImage` in the top-down convention, so it
 * flows through the same placement and sizing as a bitmap figure.
 */
export function extractVectorFiguresFromOperatorList(
  opList: ReflowOperatorList,
  pageIndex: number,
  page: { width: number; height: number },
): ReflowImage[] {
  const figures: ReflowImage[] = [];
  for (const group of clusterPaths(collectPaintedPaths(opList))) {
    const width = group.maxX - group.minX + 2 * REGION_PADDING_PT;
    const height = group.maxY - group.minY + 2 * REGION_PADDING_PT;
    const isFigureSized = width >= MIN_WIDTH_RATIO * page.width && height >= MIN_HEIGHT_PT;
    const isPageFrame = width * height >= MAX_PAGE_AREA_RATIO * page.width * page.height;
    if (!group.isDiagramLike || !isFigureSized || isPageFrame) continue;
    const region: FigureRegion = {
      x: group.minX - REGION_PADDING_PT,
      y: -(group.maxY + REGION_PADDING_PT),
      width,
      height,
    };
    figures.push({
      pageIndex,
      pageWidth: page.width,
      ...region,
      ref: vectorFigureRef(region),
    });
  }
  return figures.sort((a, b) => a.y - b.y);
}

/**
 * Drops the text items whose centre lies inside a figure, so the drawing's
 * labels are not extracted as body text or table rows next to the drawing.
 */
export function dropTextInsideFigures(
  items: ReflowTextItem[],
  figures: readonly FigureRegion[],
): ReflowTextItem[] {
  if (figures.length === 0) return items;
  return items.filter((item) => {
    // `y` is the baseline; the glyph body sits above it, i.e. at smaller y.
    const centerX = item.x + item.width / 2;
    const centerY = item.y - item.fontSize * 0.3;
    return !figures.some(
      (figure) =>
        centerX >= figure.x &&
        centerX <= figure.x + figure.width &&
        centerY >= figure.y &&
        centerY <= figure.y + figure.height,
    );
  });
}

/** Render scale for figure bitmaps: 2x keeps thin strokes and small labels crisp. */
const RENDER_SCALE = 2;

/** Bitmap data in the shape `ImageBitmapDecoder` accepts. */
export interface RenderedFigure {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/**
 * Renders just a figure's region of a page onto a white canvas (white so the
 * drawing stays legible in dark and sepia themes, like the page in page mode).
 * Rotation is forced to 0 because region coordinates ignore page rotation.
 */
export async function renderVectorFigure(page: PDFPageProxy, region: FigureRegion): Promise<RenderedFigure> {
  const [viewLeft, , , viewTop] = page.view;
  const viewport = page.getViewport({
    scale: RENDER_SCALE,
    rotation: 0,
    offsetX: -RENDER_SCALE * (region.x - viewLeft),
    offsetY: -RENDER_SCALE * (viewTop + region.y),
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(region.width * RENDER_SCALE);
  canvas.height = Math.ceil(region.height * RENDER_SCALE);
  await page.render({ canvas, viewport, background: 'white' }).promise;
  const bitmap = await createImageBitmap(canvas);
  return { bitmap, width: canvas.width, height: canvas.height };
}
