import { OPS } from 'pdfjs-dist';
import type { ReflowImage } from '@taking-book/core';

/**
 * Reflow image helpers: extracting figure positions from a pdf.js operator
 * list, decoding the pixel data a figure needs, and caching decoded object
 * URLs. The decoding layer is an interface so a raw-array/Canvas decoder can be
 * added later without touching the extraction or rendering code.
 */

/** Fraction of the page area a background image must not cover to be kept. */
export const DEFAULT_MAX_PAGE_AREA_RATIO = 0.9;

/** Number of decoded object URLs kept before least-recently-used eviction. */
export const IMAGE_URL_CACHE_SIZE = 24;

export interface ExtractReflowImageOptions {
  /**
   * An image whose bounding box covers at least this fraction of the page is
   * treated as a full-page background (and dropped) when the page also has
   * text. Default 0.9.
   */
  maxPageAreaRatio?: number;
}

/** Shape of a pdf.js operator list, narrowed to what the scan needs. */
export interface ReflowOperatorList {
  fnArray: number[];
  argsArray: unknown[];
}

/** A pdf.js page-side object pool that resolves image data by object id. */
export interface PdfObjectPool {
  get(objId: string, callback?: (data: unknown) => void): unknown;
}

/**
 * Resolves an object from a pdf.js pool, returning undefined instead of
 * throwing when the object has not been transferred to the main thread yet.
 */
export function tryGetObject(pool: PdfObjectPool, objId: string): unknown {
  try {
    return pool.get(objId);
  } catch {
    return undefined;
  }
}

/** How long to wait for a pdf.js object to resolve before giving up. */
export const OBJECT_RESOLVE_TIMEOUT_MS = 10000;

/**
 * Resolves an object from a pdf.js pool, waiting for the worker to finish
 * decoding and transferring it if it has not landed yet. pdf.js's operator
 * list resolves as soon as it is *built*, not once every image it references
 * has finished its own async decode, so a page's largest image (a full-page
 * cover, most often) can still be in flight the instant a caller asks for it
 * -- the synchronous `pool.get(objId)` throws in that case, which `tryGetObject`
 * turns into a permanent-looking `undefined`. pdf.js's pool supports a
 * callback form of `get` that fires once the object resolves instead, which
 * this waits on. `timeoutMs` bounds the wait so a bad/unreferenced id can't
 * hang a figure forever.
 */
export function getObjectAsync(
  pool: PdfObjectPool,
  objId: string,
  timeoutMs = OBJECT_RESOLVE_TIMEOUT_MS,
): Promise<unknown> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(undefined);
    }, timeoutMs);
    pool.get(objId, (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Applies a PDF transform [a, b, c, d, e, f] to a point and returns [x, y]. */
function transformPoint(m: readonly number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Concatenates two PDF transforms, matching canvas/PDF row-vector order. */
function multiply(m1: readonly number[], m2: readonly number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/**
 * Converts a paint transform into an axis-aligned bbox in the reflow engine's
 * top-down convention. pdf.js paints an image as a unit square (the
 * `paintImageXObject` width/height args are pixel resolution, not placed size;
 * the renderer scales by 1/width,1/height before drawing), so the bbox is the
 * transform applied to the corners of that unit square. The transform is in
 * PDF user space (origin bottom-left, y grows upward), so the y axis is negated
 * to make `y` the figure's top edge, consistent with text fragment positions.
 */
function bboxFromTransform(
  m: readonly number[],
  page: { index: number; width: number },
  ref: string,
): ReflowImage {
  const corners = [
    transformPoint(m, 0, 0),
    transformPoint(m, 1, 0),
    transformPoint(m, 0, 1),
    transformPoint(m, 1, 1),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    pageIndex: page.index,
    pageWidth: page.width,
    x: minX,
    y: -maxY,
    width: maxX - minX,
    height: maxY - minY,
    ref,
  };
}

/**
 * Walks a page's operator list and returns the images painted on it, each with
 * its placed bounding box. The current transform is tracked through
 * save/restore/transform operations, and each named image is emitted once per
 * page (repeated paints of the same object are deduped). `pageWidth` is the
 * page's width in the same units as the bbox, kept so a figure can later be
 * sized as a share of its page. Background filtering
 * is not done here — it needs per-page text presence, so the caller applies
 * `filterBackgroundFigures`.
 */
export function extractImagesFromOperatorList(
  opList: ReflowOperatorList,
  pageIndex: number,
  pageWidth: number,
): ReflowImage[] {
  const images: ReflowImage[] = [];
  const seen = new Set<string>();
  const transformStack: number[][] = [[1, 0, 0, 1, 0, 0]];
  const { fnArray, argsArray } = opList;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    if (fn === OPS.save) {
      transformStack.push([...transformStack[transformStack.length - 1]]);
    } else if (fn === OPS.restore) {
      if (transformStack.length > 1) transformStack.pop();
    } else if (fn === OPS.transform) {
      const m = args as number[] | undefined;
      if (m && m.length === 6) {
        const top = transformStack[transformStack.length - 1];
        transformStack[transformStack.length - 1] = multiply(top, m);
      }
    } else if (fn === OPS.paintImageXObject) {
      const [ref] = args as [string];
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      images.push(bboxFromTransform(
          transformStack[transformStack.length - 1],
          { index: pageIndex, width: pageWidth },
          ref,
        ));
    }
  }

  return images;
}

/**
 * Drops full-page backgrounds: an image whose bbox covers most of its page is
 * kept only when the page has no text (a cover or full-page illustration),
 * because a full-page image *behind* text is page furniture rather than
 * content. `pageAreas` is indexed by page; pages with unknown area keep their
 * images. Returns a new array.
 */
export function filterBackgroundFigures(
  images: ReflowImage[],
  pageAreas: Array<number | undefined>,
  pagesWithText: ReadonlySet<number>,
  options: ExtractReflowImageOptions = {},
): ReflowImage[] {
  const maxPageAreaRatio = options.maxPageAreaRatio ?? DEFAULT_MAX_PAGE_AREA_RATIO;
  return images.filter((image) => {
    const area = pageAreas[image.pageIndex];
    if (!area) return true;
    const coversPage = image.width * image.height >= maxPageAreaRatio * area;
    return !(coversPage && pagesWithText.has(image.pageIndex));
  });
}

/**
 * pdf.js image data that carries a canvas-drawable bitmap, plus the size to
 * draw it at. `bitmap` is an ImageBitmap on pdf.js's canvas decode path, but a
 * VideoFrame when pdf.js instead decoded the image via the WebCodecs
 * `ImageDecoder` API -- its fast path for JPEGs on runtimes that support it,
 * which includes Electron's Chromium. Both implement CanvasImageSource, so
 * both can be drawn directly; neither exposes the draw size as `.width`/
 * `.height` reliably (VideoFrame has no such properties at all), so the size
 * is read from the wrapping object, which pdf.js always populates.
 */
interface DrawableImageData {
  bitmap: ImageBitmap | VideoFrame;
  width: number;
  height: number;
}

function isDrawableImageData(obj: unknown): obj is DrawableImageData {
  if (typeof obj !== 'object' || obj === null) return false;
  const { bitmap, width, height } = obj as Record<string, unknown>;
  if (typeof width !== 'number' || typeof height !== 'number') return false;
  return bitmap instanceof ImageBitmap || (typeof VideoFrame !== 'undefined' && bitmap instanceof VideoFrame);
}

/** Turns a pdf.js image object into a renderable Blob. */
export interface ImageDecoder {
  canDecode(obj: unknown): boolean;
  decode(obj: unknown): Promise<Blob>;
}

/**
 * Decodes figures pdf.js exposes as a drawable bitmap (ImageBitmap or
 * VideoFrame -- see `DrawableImageData`). First-cut decoder; raw array-backed
 * formats (JPX, CMYK, masks) are left to future decoders.
 */
export class ImageBitmapDecoder implements ImageDecoder {
  canDecode(obj: unknown): boolean {
    return isDrawableImageData(obj);
  }

  async decode(obj: unknown): Promise<Blob> {
    const { bitmap, width, height } = obj as DrawableImageData;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D context to decode a reflow image.');
    // The bitmap is deliberately not closed: it is owned by pdf.js's object
    // store, which closes it on cleanup/destroy. Closing it here detaches it,
    // so a second decode of the same ref (cache eviction, a repeated figure)
    // would throw "The image source is detached".
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode a reflow image.');
    return blob;
  }
}

/**
 * Bounded cache of decoded image object URLs, evicting the least-recently-used
 * entry (and revoking its URL) so a long image-heavy document does not keep
 * every decoded figure in memory. Keys are scoped by file hash so two documents
 * with the same pdf.js object ids never collide.
 */
export class ImageUrlCache {
  private entries = new Map<string, string>();

  constructor(private readonly maxEntries: number) {}

  get(fileHash: string, ref: string): string | undefined {
    const key = `${fileHash}:${ref}`;
    const url = this.entries.get(key);
    if (url === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, url);
    return url;
  }

  set(fileHash: string, ref: string, url: string): void {
    const key = `${fileHash}:${ref}`;
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, url);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const evicted = this.entries.get(oldest) as string;
      URL.revokeObjectURL(evicted);
      this.entries.delete(oldest);
    }
  }
}