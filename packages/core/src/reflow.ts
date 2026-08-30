/**
 * Reflow engine: converts positioned PDF text items (from pdf.js getTextContent)
 * into a flowing sequence of paragraphs that can wrap to any width. Purely
 * functional and platform-agnostic so desktop and mobile can share it.
 *
 * PDF text arrives as fragments with coordinates; this reconstructs visual
 * reading order (group fragments into lines, lines into paragraphs) and drops
 * the fixed pagination so a narrow screen can re-wrap the text.
 */

/** A single extracted text fragment, positioned top-down (y grows downward). */
export interface ReflowTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}

/** A reconstructed line of text (left-to-right join of fragments). */
export interface ReflowLine {
  x: number;
  y: number;
  fontSize: number;
  text: string;
}

/** A block of text that can be re-wrapped at render time. */
export interface ReflowParagraph {
  text: string;
  fontSize: number;
  indent: boolean;
  pageIndex: number;
  /** Baseline y of the first line (top-down, larger lower on the page), used to interleave images. */
  y: number;
}

/**
 * A figure extracted from a PDF page, positioned top-down (larger y lower on
 * the page). The renderer decodes the pixel data through the `ref` handle,
 * which is opaque here so core stays platform-agnostic (desktop resolves it
 * against pdf.js page objects).
 */
export interface ReflowImage {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Opaque handle a platform uses to resolve the image's pixel data. */
  ref: string;
}

/** A figure assigned a place in the paragraph flow. */
export interface PositionedReflowImage extends ReflowImage {
  /**
   * Index of the paragraph this image renders before. Ranges over
   * [0, paragraphs.length]; an end value means "after the last paragraph".
   */
  beforeParagraphIndex: number;
}

export interface ReflowOptions {
  /** Same-line tolerance, as a fraction of the line font size (default 0.5). */
  lineGroupToleranceRatio?: number;
  /** Vertical gap (× font size) that starts a new paragraph (default 1.5). */
  paragraphGapRatio?: number;
  /** First-line indent, as a fraction of font size, that marks a new paragraph (default 1.0). */
  indentRatio?: number;
  /** Relative font-size change that starts a new paragraph (default 0.15). */
  fontSizeChangeRatio?: number;
  /** Horizontal gap (× font size) that forces a space between fragments (default 0.2). */
  wordGapRatio?: number;
}

const DEFAULTS: Required<ReflowOptions> = {
  lineGroupToleranceRatio: 0.5,
  paragraphGapRatio: 1.5,
  indentRatio: 1.0,
  fontSizeChangeRatio: 0.15,
  wordGapRatio: 0.2,
};

function mergeOptions(options: ReflowOptions | undefined): Required<ReflowOptions> {
  return { ...DEFAULTS, ...options };
}

/**
 * Removes text fragments that share the same origin coordinates. Some PDFs
 * embed duplicate or partially overlapping text items at identical positions
 * (e.g. a watermark repeated five times, or "漢字" alongside a stray "漢"),
 * which would otherwise be concatenated into garbage like
 * "reated in Master PDF Editorreated in Master PDF Editor…". When several
 * fragments occupy the same spot, the widest one is kept since it carries the
 * most complete text.
 */
function dedupOverlapping(items: ReflowTextItem[]): ReflowTextItem[] {
  const byOrigin = new Map<string, ReflowTextItem>();
  for (const item of items) {
    if (item.str.trim().length === 0) continue;
    const key = `${item.x.toFixed(1)}|${item.y.toFixed(1)}`;
    const existing = byOrigin.get(key);
    if (!existing || item.width > existing.width) byOrigin.set(key, item);
  }
  return [...byOrigin.values()];
}

/**
 * Groups fragments into lines by baseline proximity, sorting each line
 * left-to-right and joining fragments with a space when the gap suggests a word
 * boundary. Returns lines top-to-bottom.
 */
export function extractLines(
  items: ReflowTextItem[],
  options?: ReflowOptions,
): ReflowLine[] {
  const opts = mergeOptions(options);

  const deduped = dedupOverlapping(items);
  const sorted = [...deduped].sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: { items: ReflowTextItem[]; y: number }[] = [];
  for (const item of sorted) {
    let target = lines.find(
      (line) => Math.abs(line.y - item.y) <= opts.lineGroupToleranceRatio * item.fontSize,
    );
    if (!target) {
      target = { items: [], y: item.y };
      lines.push(target);
    }
    target.items.push(item);
  }

  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x);
    const text = joinFragments(line.items, opts.wordGapRatio);
    const fontSize = Math.max(...line.items.map((i) => i.fontSize));
    return {
      x: line.items[0].x,
      y: line.y,
      fontSize,
      text,
    };
  });
}

function joinFragments(items: ReflowTextItem[], wordGapRatio: number): string {
  let out = '';
  let prevRight = 0;
  let prevFont = 0;
  for (const item of items) {
    const gap = item.x - prevRight;
    const needSpace =
      out.length > 0 &&
      !out.endsWith(' ') &&
      !item.str.startsWith(' ') &&
      gap > wordGapRatio * Math.max(prevFont, item.fontSize);
    if (needSpace) out += ' ';
    out += item.str;
    prevRight = item.x + item.width;
    prevFont = item.fontSize;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Groups top-to-bottom lines into paragraphs. A new paragraph starts on:
 * a vertical gap larger than `paragraphGapRatio`× font size, a relative font
 * size change larger than `fontSizeChangeRatio`, or a first-line indent larger
 * than `indentRatio`× font size.
 */
export function paragraphsFromLines(
  lines: ReflowLine[],
  pageIndex: number,
  options?: ReflowOptions,
): ReflowParagraph[] {
  const opts = mergeOptions(options);
  const paragraphs: ReflowParagraph[] = [];

  lines.forEach((line, index) => {
    const lastLine = lines[index - 1];
    const prev = paragraphs[paragraphs.length - 1];

    if (!prev || !lastLine) {
      paragraphs.push({ text: line.text, fontSize: line.fontSize, indent: false, pageIndex, y: line.y });
      return;
    }

    const gap = line.y - lastLine.y;
    const relativeSizeChange =
      Math.abs(line.fontSize - lastLine.fontSize) / Math.max(lastLine.fontSize, 1);
    const indent = line.x - lastLine.x > opts.indentRatio * line.fontSize;

    const startsNew =
      gap > opts.paragraphGapRatio * line.fontSize ||
      relativeSizeChange > opts.fontSizeChangeRatio ||
      indent;

    if (startsNew) {
      paragraphs.push({ text: line.text, fontSize: line.fontSize, indent, pageIndex, y: line.y });
    } else {
      prev.text += ' ' + line.text;
    }
  });

  return paragraphs;
}

/**
 * Full pipeline: fragments → lines → paragraphs for one page. Pages are
 * processed independently; multi-page flow joins are handled by the caller so
 * page boundaries can be rendered as spacing.
 */
export function reflowPage(items: ReflowTextItem[], pageIndex: number, options?: ReflowOptions): ReflowParagraph[] {
  const lines = extractLines(items, options);
  return paragraphsFromLines(lines, pageIndex, options);
}

/**
 * Places each image before the first paragraph whose top sits at or below the
 * image's y on the same page (so a figure beside text collapses to image-first,
 * with the co-located text flowing after it), or before the first paragraph of
 * the next page when nothing on its own page qualifies. Returns a new array;
 * the paragraph list and its indices are left untouched so reflow annotation
 * anchors stay stable.
 */
export function assignImagePositions(
  paragraphs: ReflowParagraph[],
  images: ReflowImage[],
): PositionedReflowImage[] {
  const sorted = [...images].sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y);
  return sorted.map((image) => {
    const index = paragraphs.findIndex(
      (para) =>
        para.pageIndex > image.pageIndex ||
        (para.pageIndex === image.pageIndex && para.y >= image.y),
    );
    return { ...image, beforeParagraphIndex: index === -1 ? paragraphs.length : index };
  });
}

interface BoilerplateOptions {
  /** Shortest text (in characters) worth considering as boilerplate. */
  minLength?: number;
  /** Longest text (in characters) that can still be boilerplate. */
  maxLength?: number;
  /** Fraction of pages a repeated line must appear on to be dropped. */
  coverageRatio?: number;
}

const BOILERPLATE_DEFAULTS: Required<BoilerplateOptions> = {
  minLength: 12,
  maxLength: 120,
  coverageRatio: 0.6,
};

/**
 * Drops paragraphs that repeat verbatim across most pages — running headers,
 * footers, and watermarks (e.g. a "Created in Master PDF Editor" stamp on every
 * page). These are page furniture, not content, and would otherwise clutter
 * continuous reflow text. Takes the concatenated multi-page paragraph list.
 */
export function filterBoilerplateParagraphs(
  paragraphs: ReflowParagraph[],
  options?: BoilerplateOptions,
): ReflowParagraph[] {
  if (paragraphs.length === 0) return paragraphs;
  const opts = { ...BOILERPLATE_DEFAULTS, ...options };

  const totalPages = new Set(paragraphs.map((p) => p.pageIndex)).size;
  if (totalPages <= 1) return paragraphs;

  const pagesByText = new Map<string, Set<number>>();
  for (const para of paragraphs) {
    const text = para.text.trim();
    if (text.length < opts.minLength || text.length > opts.maxLength) continue;
    let pages = pagesByText.get(text);
    if (!pages) {
      pages = new Set<number>();
      pagesByText.set(text, pages);
    }
    pages.add(para.pageIndex);
  }

  const boilerplate = new Set<string>();
  for (const [text, pages] of pagesByText) {
    if (pages.size / totalPages >= opts.coverageRatio) boilerplate.add(text);
  }

  if (boilerplate.size === 0) return paragraphs;
  return paragraphs.filter((para) => !boilerplate.has(para.text.trim()));
}
