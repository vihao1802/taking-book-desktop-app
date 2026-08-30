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
   * Images whose bounding box covers at least this fraction of the page are
   * treated as full-page backgrounds and dropped. Default 0.9.
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
  get(objId: string): unknown;
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

/** Converts a paint transform and image pixel size into an axis-aligned bbox. */
function bboxFromTransform(
  m: readonly number[],
  pixelWidth: number,
  pixelHeight: number,
  pageIndex: number,
  ref: string,
): ReflowImage {
  const corners = [
    transformPoint(m, 0, 0),
    transformPoint(m, pixelWidth, 0),
    transformPoint(m, 0, pixelHeight),
    transformPoint(m, pixelWidth, pixelHeight),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { pageIndex, x: minX, y: minY, width: maxX - minX, height: maxY - minY, ref };
}

/**
 * Walks a page's operator list and returns the images painted on it, each with
 * its placed bounding box in PDF user space. The current transform is tracked
 * through save/restore/transform operations; each named image is emitted once
 * per page (repeated paints of the same object are deduped), and images that
 * cover the whole page are skipped as backgrounds.
 */
export function extractImagesFromOperatorList(
  opList: ReflowOperatorList,
  pageIndex: number,
  pageArea: number,
  options: ExtractReflowImageOptions = {},
): ReflowImage[] {
  const maxPageAreaRatio = options.maxPageAreaRatio ?? DEFAULT_MAX_PAGE_AREA_RATIO;
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
      const [ref, pixelWidth, pixelHeight] = args as [string, number, number];
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      const image = bboxFromTransform(
        transformStack[transformStack.length - 1],
        pixelWidth,
        pixelHeight,
        pageIndex,
        ref,
      );
      if (image.width * image.height >= maxPageAreaRatio * pageArea) continue;
      images.push(image);
    }
  }

  return images;
}

/** pdf.js image data that carries a decoded ImageBitmap (JPEG/PNG and friends). */
interface ImageBitmapData {
  bitmap: ImageBitmap;
}

function isImageBitmapData(obj: unknown): obj is ImageBitmapData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'bitmap' in obj &&
    (obj as { bitmap: unknown }).bitmap instanceof ImageBitmap
  );
}

/** Turns a pdf.js image object into a renderable Blob. */
export interface ImageDecoder {
  canDecode(obj: unknown): boolean;
  decode(obj: unknown): Promise<Blob>;
}

/**
 * Decodes figures pdf.js exposes as an ImageBitmap. First-cut decoder; raw
 * array-backed formats (JPX, CMYK, masks) are left to future decoders.
 */
export class ImageBitmapDecoder implements ImageDecoder {
  canDecode(obj: unknown): boolean {
    return isImageBitmapData(obj);
  }

  async decode(obj: unknown): Promise<Blob> {
    const { bitmap } = obj as ImageBitmapData;
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get a 2D context to decode a reflow image.');
    ctx.drawImage(bitmap, 0, 0);
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