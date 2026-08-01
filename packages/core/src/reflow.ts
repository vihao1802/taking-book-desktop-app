/**
 * Reflow engine: converts positioned PDF text items (from pdf.js getTextContent)
 * into a flowing sequence of paragraphs that can wrap to any width. Purely
 * functional and platform-agnostic so desktop and mobile can share it.
 *
 * PDF text arrives as fragments with coordinates; this reconstructs visual
 * reading order (group fragments into lines, lines into paragraphs) and drops
 * the fixed pagination so a narrow screen can re-wrap the text.
 */

/** A single extracted text fragment, in PDF user space (y grows downward). */
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
 * Groups fragments into lines by baseline proximity, sorting each line
 * left-to-right and joining fragments with a space when the gap suggests a word
 * boundary. Returns lines top-to-bottom.
 */
export function extractLines(
  items: ReflowTextItem[],
  options?: ReflowOptions,
): ReflowLine[] {
  const opts = mergeOptions(options);
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);

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
      paragraphs.push({ text: line.text, fontSize: line.fontSize, indent: false, pageIndex });
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
      paragraphs.push({ text: line.text, fontSize: line.fontSize, indent, pageIndex });
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
