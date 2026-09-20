/**
 * Reflow engine: converts positioned PDF text items (from pdf.js getTextContent)
 * into a flowing sequence of paragraphs that can wrap to any width. Purely
 * functional and platform-agnostic so desktop and mobile can share it.
 *
 * PDF text arrives as fragments with coordinates; this reconstructs visual
 * reading order (group fragments into lines, lines into paragraphs) and drops
 * the fixed pagination so a narrow screen can re-wrap the text.
 */

import { detectContentsEntries, type ContentsEntry } from './reflowContents';

/** A single extracted text fragment, positioned top-down (y grows downward). */
export interface ReflowTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  /** Rendered with a heavier weight; detected from the PDF font name. */
  bold?: boolean;
  /** Rendered with a slanted style; detected from the PDF font name. */
  italic?: boolean;
  /** Set in a fixed-pitch font; lines made only of such fragments are treated as code. */
  monospace?: boolean;
  /** Ink color as `#rrggbb`, set only on code fragments whose color differs from plain text. */
  color?: string;
}

/**
 * A contiguous stretch of paragraph text sharing one visual style. Runs must
 * partition the paragraph exactly: `runs.join('') === paragraph.text`, which
 * keeps reflow annotation anchors (char offsets into the text) stable.
 */
export interface ReflowRun {
  text: string;
  bold: boolean;
  italic: boolean;
  /**
   * Ink color as `#rrggbb`, kept for syntax-highlighted code. Absent means the
   * theme's normal text color, so a color designed for the book's own page
   * background never has to be trusted on the reader's.
   */
  color?: string;
}

/** The visual style a run carries, everything but its text. */
export type ReflowRunStyle = Omit<ReflowRun, 'text'>;

const PLAIN_STYLE: ReflowRunStyle = { bold: false, italic: false };

/**
 * Detects bold/italic from a PDF font's PostScript name (e.g.
 * "Helvetica-Bold", "Times-BoldItalicMT"). Mirrors pdf.js's own heuristic so
 * desktop and mobile agree on what a font name means. Fonts that fake bold via
 * stroking or fail to embed a name are silently missed and render regular.
 */
export function fontStyleFromName(name: string | null): { bold: boolean; italic: boolean } {
  if (name == null) return { bold: false, italic: false };
  return {
    bold: /bold/i.test(name),
    italic: /oblique|italic/i.test(name),
  };
}

/** PostScript names of common fixed-pitch fonts. "Monotype" is a foundry, not a pitch. */
const MONOSPACE_FONT_NAME =
  /mono(?!type)|courier|consolas|menlo|monaco|inconsolata|lucida\s?console|source\s?code|fira\s?code|jetbrains|cousine|andale|typewriter/i;

/**
 * Decides whether a PDF font is fixed-pitch, from either its PostScript name
 * or the generic family pdf.js falls back to (which follows the font
 * descriptor's FixedPitch flag). Either signal is enough because fonts often
 * carry one without the other. Unresolvable fonts are treated as proportional.
 *
 * @param name - The font's PostScript name (e.g. "ABCDEF+Consolas"), if known.
 * @param fallbackFamily - pdf.js's generic fallback family ("monospace", "serif", ...), if known.
 * @returns True when text in this font should be rendered as code.
 */
export function isMonospaceFont(name: string | null, fallbackFamily: string | null): boolean {
  if (fallbackFamily != null && /monospace/i.test(fallbackFamily)) return true;
  return name != null && MONOSPACE_FONT_NAME.test(name);
}

/** Layout of a code line, kept so the paragraph builder can restore its indentation. */
export interface ReflowCodeMetrics {
  /** Horizontal advance of one character, from the line's own glyph widths. */
  charWidth: number;
}

/** A reconstructed line of text (left-to-right join of fragments). */
export interface ReflowLine {
  x: number;
  /** Right edge of the line's last fragment; with `x` it tells whether the line is centered. */
  right: number;
  y: number;
  fontSize: number;
  text: string;
  /** Styled runs partitioning `text` exactly (`runs.join('') === text`). */
  runs: ReflowRun[];
  /** True when the line looks like a table row: multi-column with aligned neighbors. */
  isTable?: boolean;
  /**
   * Set when every fragment is monospace. `text` then keeps the spacing between
   * fragments (padded to the character grid) instead of collapsing it, and `x`
   * is where the first non-space character sits, so indentation can be compared.
   */
  code?: ReflowCodeMetrics;
}

/** A block of text that can be re-wrapped at render time. */
export interface ReflowParagraph {
  text: string;
  fontSize: number;
  indent: boolean;
  pageIndex: number;
  /** Baseline y of the first line (top-down, larger lower on the page), used to interleave images. */
  y: number;
  /** Styled runs partitioning `text` exactly (`runs.join('') === text`). */
  runs: ReflowRun[];
  /** Horizontal alignment for reflow rendering: 'left' | 'center' | 'right' | 'justify'. */
  align?: 'left' | 'center' | 'right' | 'justify';
  /**
   * True when the paragraph came from detected table rows. The renderer keeps
   * the original (small) font size and scrolls horizontally instead of
   * re-wrapping, so upscaling body text never breaks the table layout.
   */
  isTable?: boolean;
  /**
   * Set when the paragraph is one table-of-contents entry ("title page").
   * Entries stand alone instead of merging into body text; `level` is the
   * nesting depth the renderer indents by and `pageStart` the offset in `text`
   * where the page label begins, so the renderer can right-align it.
   */
  contents?: { level: number; pageStart: number };
  /**
   * True for a block of source code. Unlike prose, `text` keeps its line breaks
   * (`\n`) and leading spaces, so the renderer must show it preformatted rather
   * than re-wrap it. Runs still partition `text` exactly.
   */
  code?: boolean;
}

/**
 * A figure extracted from a PDF page, positioned top-down (larger y lower on
 * the page). The renderer decodes the pixel data through the `ref` handle,
 * which is opaque here so core stays platform-agnostic (desktop resolves it
 * against pdf.js page objects).
 */
export interface ReflowImage {
  pageIndex: number;
  /** Width of the PDF page the image sits on, so a figure can be sized as a share of it. */
  pageWidth: number;
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
  /** Columns a line needs to count as a table-row candidate (default 3). */
  tableMinColumns?: number;
  /** Horizontal gap (× font size) that marks a column break inside a table row (default 1.0). */
  tableGapRatio?: number;
  /** Column-start alignment tolerance, as a fraction of font size (default 0.75). */
  tableAlignToleranceRatio?: number;
}

const DEFAULTS: Required<ReflowOptions> = {
  lineGroupToleranceRatio: 0.5,
  paragraphGapRatio: 1.5,
  indentRatio: 1.0,
  fontSizeChangeRatio: 0.15,
  wordGapRatio: 0.2,
  tableMinColumns: 3,
  tableGapRatio: 1.0,
  tableAlignToleranceRatio: 0.75,
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

  const fontSizes = lines.map((line) =>
    Math.max(...line.items.map((i) => i.fontSize)),
  );
  const tableFlags = detectTableRows(lines, fontSizes, opts);

  return lines.map((line, lineIndex) => {
    line.items.sort((a, b) => a.x - b.x);
    const fontSize = Math.max(...line.items.map((i) => i.fontSize));
    // Code is checked before tables: the wide gaps of aligned code would
    // otherwise read as table columns.
    const codeLine = buildCodeLine(line.items, line.y, fontSize);
    if (codeLine) return codeLine;
    const joined = joinLineRuns(line.items, opts.wordGapRatio);
    return {
      x: line.items[0].x,
      right: Math.max(...line.items.map((i) => i.x + i.width)),
      y: line.y,
      fontSize,
      text: joined.text,
      runs: joined.runs,
      ...(tableFlags[lineIndex] ? { isTable: true as const } : {}),
    };
  });
}

/**
 * Flags lines that look like table rows: several column groups separated by
 * wide gaps, with column starts aligning across neighboring rows. Tables are
 * detected by layout (gaps + alignment), not by font size, so a small-print
 * table inside body text is still caught. A candidate row needs a neighboring
 * candidate with overlapping columns; a row with one extra column beyond the
 * minimum is accepted alone so a lone wide header row is not missed.
 */
function detectTableRows(
  grouped: { items: ReflowTextItem[] }[],
  fontSizes: number[],
  opts: Required<ReflowOptions>,
): boolean[] {
  const columnStarts: number[][] = grouped.map((line, index) => {
    const sorted = [...line.items].sort((a, b) => a.x - b.x);
    const starts: number[] = [];
    const fontSize = fontSizes[index] ?? 1;
    let prevRight = -Infinity;
    for (const item of sorted) {
      if (starts.length === 0 || item.x - prevRight > opts.tableGapRatio * fontSize) {
        starts.push(item.x);
      }
      prevRight = Math.max(prevRight, item.x + item.width);
    }
    return starts;
  });

  const candidates = columnStarts.map((starts) => starts.length >= opts.tableMinColumns);

  const aligned = (a: number, b: number): boolean => {
    if (a < 0 || b < 0 || a >= candidates.length || b >= candidates.length) return false;
    if (!candidates[a] || !candidates[b]) return false;
    const sizeA = fontSizes[a] ?? 1;
    const sizeB = fontSizes[b] ?? 1;
    const tolerance = opts.tableAlignToleranceRatio * Math.max(sizeA, sizeB, 1);
    const startsA = columnStarts[a] ?? [];
    const startsB = columnStarts[b] ?? [];
    let matches = 0;
    for (const x of startsA) {
      if (startsB.some((y) => Math.abs(x - y) <= tolerance)) {
        matches++;
        if (matches >= 2) return true;
      }
    }
    return false;
  };

  return candidates.map((isCandidate, index) => {
    if (!isCandidate) return false;
    // A row with one column more than the minimum is distinctive enough to
    // accept without a matching neighbor (e.g. a lone four-column header).
    if ((columnStarts[index]?.length ?? 0) > opts.tableMinColumns) return true;
    return aligned(index, index - 1) || aligned(index, index + 1);
  });
}

/**
 * Appends `text` to the last run when it shares the same style, otherwise
 * starts a new run. Keeps runs as maximal contiguous same-style stretches, the
 * shape `ReflowRun` promises.
 */
function appendRun(runs: ReflowRun[], text: string, style: ReflowRunStyle): void {
  if (text === '') return;
  const last = runs[runs.length - 1];
  if (last && last.bold === style.bold && last.italic === style.italic && last.color === style.color) {
    last.text += text;
  } else {
    runs.push({ text, bold: style.bold, italic: style.italic, ...(style.color ? { color: style.color } : {}) });
  }
}

/** The style of the last run, so filler whitespace joins it instead of splitting it. */
function trailingStyle(runs: ReflowRun[]): ReflowRunStyle {
  return runs[runs.length - 1] ?? PLAIN_STYLE;
}

/** The style of a text fragment, as its run would carry it. */
function itemStyle(item: ReflowTextItem): ReflowRunStyle {
  return { bold: item.bold ?? false, italic: item.italic ?? false, ...(item.color ? { color: item.color } : {}) };
}

function joinLineRuns(items: ReflowTextItem[], wordGapRatio: number): { text: string; runs: ReflowRun[] } {
  const runs: ReflowRun[] = [];
  let prevRight = 0;
  let prevFont = 0;
  for (const item of items) {
    const gap = item.x - prevRight;
    const needSpace =
      runs.length > 0 &&
      !runs[runs.length - 1].text.endsWith(' ') &&
      !item.str.startsWith(' ') &&
      gap > wordGapRatio * Math.max(prevFont, item.fontSize);
    if (needSpace) appendRun(runs, ' ', PLAIN_STYLE);
    appendRun(runs, item.str, itemStyle(item));
    prevRight = item.x + item.width;
    prevFont = item.fontSize;
  }
  return collapseRuns(runs);
}

/** Fallback advance of one monospace character, as a fraction of font size (the usual 0.6 em). */
const CODE_CHAR_WIDTH_RATIO = 0.6;

/** The median per-character advance of the fragments, robust to a stray wide glyph. */
function medianCharWidth(items: ReflowTextItem[], fallback: number): number {
  const widths = items
    .filter((item) => item.str.length > 0 && item.width > 0)
    .map((item) => item.width / item.str.length)
    .sort((a, b) => a - b);
  return widths.length === 0 ? fallback : widths[Math.floor(widths.length / 2)];
}

/**
 * Drops leading and trailing whitespace across a run list without disturbing
 * the styling of what remains. Returns how many leading characters were cut,
 * which is the line's indentation in characters.
 */
function trimRuns(runs: ReflowRun[]): { runs: ReflowRun[]; leading: number } {
  const text = runs.map((run) => run.text).join('');
  const leading = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  const trimmed: ReflowRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const from = Math.max(leading - offset, 0);
    const to = Math.min(end - offset, run.text.length);
    if (to > from) trimmed.push({ ...run, text: run.text.slice(from, to) });
    offset += run.text.length;
  }
  return { runs: trimmed, leading };
}

/**
 * Builds a code line from its fragments, or returns null when any fragment is
 * proportional. Code is laid out on a character grid, so each fragment is
 * padded with spaces up to its column instead of being joined by the prose
 * word-gap heuristic; that keeps the spacing inside the line (aligned
 * comments, operators) exactly as typeset.
 */
function buildCodeLine(items: ReflowTextItem[], y: number, fontSize: number): ReflowLine | null {
  if (items.length === 0 || !items.every((item) => item.monospace === true)) return null;
  const charWidth = medianCharWidth(items, fontSize * CODE_CHAR_WIDTH_RATIO);
  const originX = items[0].x;
  const padded: ReflowRun[] = [];
  let length = 0;
  for (const item of items) {
    const column = Math.round((item.x - originX) / charWidth);
    if (column > length) {
      // Spaces take the style of what precedes them so they never split a run.
      appendRun(padded, ' '.repeat(column - length), trailingStyle(padded));
      length = column;
    }
    appendRun(padded, item.str, itemStyle(item));
    length += item.str.length;
  }
  const { runs, leading } = trimRuns(padded);
  return {
    x: originX + leading * charWidth,
    right: Math.max(...items.map((item) => item.x + item.width)),
    y,
    fontSize,
    text: runs.map((run) => run.text).join(''),
    runs,
    code: { charWidth },
  };
}

/**
 * Normalizes run whitespace to match the line's `text` exactly: whitespace
 * runs collapse to a single neutral space and leading/trailing whitespace is
 * trimmed, mirroring the regex `text.replace(/\s+/g, ' ').trim()`. Non-space
 * characters keep their run's style, so the invariant `runs.join('') === text`
 * holds by construction.
 */
function collapseRuns(runs: ReflowRun[]): { text: string; runs: ReflowRun[] } {
  const out: ReflowRun[] = [];
  let text = '';
  let pendingSpace = false;
  for (const run of runs) {
    let i = 0;
    while (i < run.text.length) {
      if (/\s/.test(run.text[i])) {
        pendingSpace = true;
        i++;
        continue;
      }
      if (pendingSpace) {
        if (text.length > 0) {
          appendRun(out, ' ', PLAIN_STYLE);
          text += ' ';
        }
        pendingSpace = false;
      }
      let end = i;
      while (end < run.text.length && !/\s/.test(run.text[end])) end++;
      const chunk = run.text.slice(i, end);
      appendRun(out, chunk, run);
      text += chunk;
      i = end;
    }
  }
  return { text, runs: out };
}

/** A leading number, letter or bullet that marks the first line of a list item. */
const LIST_MARKER = /^(\d+[.)]|[a-zA-Z][.)]|[•·▪◦‣–—-])\s/;

function startsWithListMarker(text: string): boolean {
  return LIST_MARKER.test(text);
}

/** Starts a paragraph from a single line, carrying over its table or contents-entry flag. */
function standaloneParagraph(
  line: ReflowLine,
  pageIndex: number,
  entry: ContentsEntry | null,
): ReflowParagraph {
  return {
    text: entry ? entry.text : line.text,
    fontSize: line.fontSize,
    indent: false,
    pageIndex,
    y: line.y,
    runs: entry ? entry.runs : [...line.runs],
    ...(line.isTable ? { isTable: true as const } : {}),
    ...(entry ? { contents: { level: entry.level, pageStart: entry.pageStart } } : {}),
  };
}

/**
 * Groups top-to-bottom lines into paragraphs. A new paragraph starts on:
 * a vertical gap larger than `paragraphGapRatio`× font size, a relative font
 * size change larger than `fontSizeChangeRatio`, or a first-line indent larger
 * than `indentRatio`× font size (except the hanging indent under a list marker).
 * Table rows always start their own paragraph
 * (one row per paragraph, flagged `isTable`) so rows never merge into flowing
 * body text and the renderer can keep them unwrapped. Table-of-contents entries
 * likewise get one paragraph each, flagged `contents`.
 */
export function paragraphsFromLines(
  lines: ReflowLine[],
  pageIndex: number,
  options?: ReflowOptions,
): ReflowParagraph[] {
  const opts = mergeOptions(options);
  const paragraphs: ReflowParagraph[] = [];
  // Source lines of each paragraph, kept in step with `paragraphs`, so
  // alignment can be judged from line geometry once grouping is done.
  const paragraphLines: ReflowLine[][] = [];

  const contentsEntries = detectContentsEntries(lines);

  lines.forEach((line, index) => {
    const lastLine = lines[index - 1];
    const prev = paragraphs[paragraphs.length - 1];
    const entry = contentsEntries[index];

    if (line.code) {
      if (prev?.code && lastLine && isSameCodeBlock(lastLine, line)) {
        paragraphLines[paragraphLines.length - 1].push(line);
      } else {
        paragraphs.push({
          text: line.text,
          fontSize: line.fontSize,
          indent: false,
          pageIndex,
          y: line.y,
          runs: [...line.runs],
          code: true,
        });
        paragraphLines.push([line]);
      }
      return;
    }

    // Table rows, contents entries and code blocks stand alone: never merge one
    // into body text, body text into one, or two of them into one paragraph.
    if (!prev || !lastLine || line.isTable || prev.isTable || entry || prev.contents || prev.code) {
      paragraphs.push(standaloneParagraph(line, pageIndex, entry));
      paragraphLines.push([line]);
      return;
    }

    const gap = line.y - lastLine.y;
    const relativeSizeChange =
      Math.abs(line.fontSize - lastLine.fontSize) / Math.max(lastLine.fontSize, 1);
    // A list item's text wraps under the words after its marker ("2. Maintain
    // ... / each recipient ..."), which is a hanging indent, not a new paragraph.
    const isHangingIndent =
      paragraphLines[paragraphLines.length - 1].length === 1 && startsWithListMarker(lastLine.text);
    // A big shift right with both lines ending at the same edge is a
    // right-aligned block (a title page), not a first-line indent.
    const continuesRightAligned =
      line.x - lastLine.x > RIGHT_ALIGNED_SHIFT_RATIO * line.fontSize &&
      Math.abs(line.right - lastLine.right) <= RIGHT_EDGE_TOLERANCE_RATIO * line.fontSize;
    const indent =
      !isHangingIndent &&
      !continuesRightAligned &&
      line.x - lastLine.x > opts.indentRatio * line.fontSize;

    const startsNew =
      gap > opts.paragraphGapRatio * line.fontSize ||
      relativeSizeChange > opts.fontSizeChangeRatio ||
      indent;

    if (startsNew) {
      paragraphs.push({
        text: line.text,
        fontSize: line.fontSize,
        indent,
        pageIndex,
        y: line.y,
        runs: [...line.runs],
      });
      paragraphLines.push([line]);
    } else {
      paragraphLines[paragraphLines.length - 1].push(line);
      prev.text += ' ' + line.text;
      appendRun(prev.runs, ' ', PLAIN_STYLE);
      for (const run of line.runs) appendRun(prev.runs, run.text, run);
    }
  });

  paragraphs.forEach((paragraph, index) => {
    if (paragraph.code) Object.assign(paragraph, buildCodeText(paragraphLines[index]));
  });
  markCenteredParagraphs(paragraphs, paragraphLines, lines);
  return paragraphs;
}

/**
 * Vertical gap (× font size) above which two code lines belong to different
 * listings. Wide enough to hold a blank line inside one listing.
 */
const CODE_BLOCK_MAX_GAP_RATIO = 3.6;
/** Line pitch (× font size) assumed at most, so a lone blank-line gap is not mistaken for the pitch. */
const CODE_LINE_HEIGHT_CAP_RATIO = 1.3;
/** Blank lines kept between two code lines, however tall the gap. */
const CODE_MAX_BLANK_LINES = 2;

function isSameCodeBlock(previous: ReflowLine, line: ReflowLine): boolean {
  return line.y - previous.y <= CODE_BLOCK_MAX_GAP_RATIO * line.fontSize;
}

/**
 * Joins a listing's lines into one text that keeps its shape: a newline per
 * line, extra newlines where the page has blank lines, and each line indented
 * by its offset from the listing's left edge in characters. The runs partition
 * the text exactly, like every other paragraph.
 */
function buildCodeText(lines: ReflowLine[]): { text: string; runs: ReflowRun[] } {
  const blockLeft = Math.min(...lines.map((line) => line.x));
  const charWidth = lines[0].code?.charWidth ?? lines[0].fontSize * CODE_CHAR_WIDTH_RATIO;
  const gaps = lines.slice(1).map((line, i) => line.y - lines[i].y);
  const lineHeight = Math.min(...gaps, lines[0].fontSize * CODE_LINE_HEIGHT_CAP_RATIO);
  const runs: ReflowRun[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      const blanks = Math.min(CODE_MAX_BLANK_LINES, Math.max(0, Math.round(gaps[index - 1] / lineHeight) - 1));
      appendRun(runs, '\n'.repeat(1 + blanks), trailingStyle(runs));
    }
    appendRun(runs, ' '.repeat(Math.max(0, Math.round((line.x - blockLeft) / charWidth))), trailingStyle(runs));
    for (const run of line.runs) appendRun(runs, run.text, run);
  });
  return { text: runs.map((run) => run.text).join(''), runs };
}

/** Allowed offset (× font size) between the right edges of two lines that count as flush right. */
const RIGHT_EDGE_TOLERANCE_RATIO = 0.5;
/** Rightward shift (× font size) beyond which a flush-right line is aligned text, not a paragraph indent. */
const RIGHT_ALIGNED_SHIFT_RATIO = 3;

/** How far inside the text column (× font size) a line must sit on each side to count as centered. */
const CENTER_INSET_RATIO = 1.5;
/** Allowed offset (× font size) between a line's midpoint and the column midpoint. */
const CENTER_TOLERANCE_RATIO = 1;

/**
 * Sets `align: 'center'` on paragraphs whose every line is centered in the
 * page's text column, and `align: 'right'` on paragraphs that are flush right. The column is the span of all body lines on the page, so
 * a full-width left-aligned paragraph (whose lines start at the column's left
 * edge) is never mistaken for centered text, however its fragments average out.
 * Table rows are skipped: they scroll horizontally and stay left-aligned.
 */
function markCenteredParagraphs(
  paragraphs: ReflowParagraph[],
  paragraphLines: ReflowLine[][],
  pageLines: ReflowLine[],
): void {
  const bodyLines = pageLines.filter((line) => !line.isTable && !line.code);
  if (bodyLines.length === 0) return;
  const columnLeft = Math.min(...bodyLines.map((line) => line.x));
  const columnRight = Math.max(...bodyLines.map((line) => line.right));
  const columnMid = (columnLeft + columnRight) / 2;

  const isCentered = (line: ReflowLine): boolean => {
    const inset = CENTER_INSET_RATIO * line.fontSize;
    const midOffset = Math.abs((line.x + line.right) / 2 - columnMid);
    return (
      line.x - columnLeft >= inset &&
      columnRight - line.right >= inset &&
      midOffset <= CENTER_TOLERANCE_RATIO * line.fontSize
    );
  };

  const isRightEdge = (line: ReflowLine): boolean =>
    Math.abs(columnRight - line.right) <= RIGHT_EDGE_TOLERANCE_RATIO * line.fontSize;

  // Flush right means the lines share a right edge but start at different
  // places (ragged left) or sit further inside the column than any paragraph indent would. Justified body text
  // shares a right edge too, but its lines all start at the column's left.
  const isFlushRight = (lines: ReflowLine[]): boolean => {
    const first = lines[0];
    const sharesRightEdge = lines.every(
      (line) => Math.abs(line.right - first.right) <= RIGHT_EDGE_TOLERANCE_RATIO * line.fontSize,
    );
    if (!sharesRightEdge) return false;
    const starts = lines.map((line) => line.x);
    const raggedLeft =
      lines.length > 1 && Math.max(...starts) - Math.min(...starts) > first.fontSize;
    const insideColumn = lines.every(
      (line) => isRightEdge(line) && line.x - columnLeft >= RIGHT_ALIGNED_SHIFT_RATIO * line.fontSize,
    );
    return raggedLeft || insideColumn;
  };

  paragraphs.forEach((paragraph, index) => {
    if (paragraph.isTable || paragraph.contents || paragraph.code) return;
    if (paragraphLines[index].every(isCentered)) paragraph.align = 'center';
    else if (isFlushRight(paragraphLines[index])) paragraph.align = 'right';
  });
}

/**
 * Full pipeline: fragments → lines → paragraphs for one page. Pages are
 * processed independently; multi-page flow joins are handled by the caller so
 * page boundaries can be rendered as spacing.
 */
export function reflowPage(
  items: ReflowTextItem[],
  pageIndex: number,
  options?: ReflowOptions,
): ReflowParagraph[] {
  const opts = mergeOptions(options);
  const lines = extractLines(items, opts);
  return paragraphsFromLines(lines, pageIndex, options);
}

/** The font size reflow body text renders at when zoom is 100% (20px). */
export const REFLOW_TARGET_FONT_SIZE = 20;

/**
 * Returns the font size carrying the most text across the document (weighted
 * by character count), so a long body at 12px beats a repeated 20px heading.
 * Table and code paragraphs are excluded: their small print must not drag the body
 * scale down (tables also keep their own size through normalization). A
 * paragraph's text is credited to its first line's size; since paragraph
 * merging only happens within the font-size-change ratio, the estimate stays
 * close. Used as the denominator for reflow normalization. Returns null for an
 * empty (or table-only) document; length ties break toward the smaller size.
 */
export function dominantFontSize(paragraphs: ReflowParagraph[]): number | null {
  if (paragraphs.length === 0) return null;
  // Code is small print like a table, and a code-heavy chapter must not drag
  // the body scale down; it only decides the size when nothing else can.
  const prose = paragraphs.filter((para) => !para.isTable && !para.code);
  const sized = prose.length > 0 ? prose : paragraphs.filter((para) => !para.isTable);
  const lengthBySize = new Map<number, number>();
  for (const para of sized) {
    lengthBySize.set(para.fontSize, (lengthBySize.get(para.fontSize) ?? 0) + para.text.length);
  }
  if (lengthBySize.size === 0) return null;
  let dominant = 0;
  let dominantLength = -1;
  for (const [size, length] of lengthBySize) {
    if (length > dominantLength || (length === dominantLength && size < dominant)) {
      dominant = size;
      dominantLength = length;
    }
  }
  return dominant;
}

/** Rendered size (× body size) above which a paragraph is a heading and is never justified. */
const HEADING_SIZE_RATIO = 1.2;

/**
 * Returns the CSS text alignment a paragraph renders with. Detected alignment
 * wins; otherwise body text is justified, but tables and headings stay left
 * aligned because justifying a short, large line stretches its words apart.
 * `paragraph.fontSize` must already be normalized to `bodySize`.
 */
export function getParagraphTextAlign(
  paragraph: ReflowParagraph,
  bodySize = REFLOW_TARGET_FONT_SIZE,
): 'left' | 'center' | 'right' | 'justify' {
  if (paragraph.isTable || paragraph.code) return 'left';
  if (paragraph.align) return paragraph.align;
  return paragraph.fontSize > bodySize * HEADING_SIZE_RATIO ? 'left' : 'justify';
}

/**
 * The normalized copy last made of each input paragraph, with the scale it was
 * made at. Extraction normalizes the growing paragraph list every few pages;
 * handing back the same copy while the scale holds keeps the object identity
 * the renderer's memoization relies on, so a flush does not re-render every
 * paragraph read so far. Copies are never mutated, so sharing them is safe.
 */
const normalizedCopies = new WeakMap<ReflowParagraph, { scale: number; copy: ReflowParagraph }>();

function normalizeParagraph(para: ReflowParagraph, scale: number): ReflowParagraph {
  const known = normalizedCopies.get(para);
  if (known && known.scale === scale) return known.copy;
  const copy = para.isTable ? { ...para } : { ...para, fontSize: para.fontSize * scale };
  normalizedCopies.set(para, { scale, copy });
  return copy;
}

/**
 * Scales every paragraph's font size so the document's dominant size renders
 * at `targetSize` when zoom is 100%. Relative sizes are preserved, so headings
 * stay proportional to body text. Table paragraphs keep their original size so
 * dense tables never blow up to body size and break their layout. Returns
 * copies of the paragraphs (the same copy for the same input and scale, see
 * `normalizedCopies`); the input list and its text/runs are left untouched. An
 * empty document passes through.
 */
export function normalizeReflowSizes(
  paragraphs: ReflowParagraph[],
  targetSize = REFLOW_TARGET_FONT_SIZE,
): ReflowParagraph[] {
  const dominant = dominantFontSize(paragraphs);
  if (dominant === null) return paragraphs;
  const scale = targetSize / dominant;
  return paragraphs.map((para) => normalizeParagraph(para, scale));
}

/**
 * Places each image before the first paragraph whose top sits at or below the
 * image's y on the same page (so a figure beside text collapses to image-first,
 * with the co-located text flowing after it), or before the first paragraph of
 * the next page when nothing on its own page qualifies. Returns a new array;
 * the paragraph list and its indices are left untouched so reflow annotation
 * anchors stay stable. Paragraphs must be in page order, as extraction produces
 * them: the search for each image then starts at its page instead of at the
 * top of the book, which keeps figure-heavy books from going quadratic.
 */
export function assignImagePositions(
  paragraphs: ReflowParagraph[],
  images: ReflowImage[],
): PositionedReflowImage[] {
  const sorted = [...images].sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y);
  // Images are sorted by page, so the first paragraph of a page can only move
  // forward from one image to the next.
  let pageStart = 0;
  return sorted.map((image) => {
    while (pageStart < paragraphs.length && paragraphs[pageStart].pageIndex < image.pageIndex) pageStart++;
    let index = pageStart;
    while (
      index < paragraphs.length &&
      !(paragraphs[index].pageIndex > image.pageIndex || paragraphs[index].y >= image.y)
    ) {
      index++;
    }
    return { ...image, beforeParagraphIndex: index };
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
