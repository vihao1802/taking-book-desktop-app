import type { ReflowLine, ReflowRun } from './reflow';

/**
 * Table-of-contents support for reflow. A contents page is a list of
 * "title ...... page" entries; left to the generic paragraph builder its lines
 * sit close together at one font size, so they merge into a single blob and the
 * dot leaders wrap into rows of dots. Here each entry is recognized so it can
 * stand alone, lose its leaders and keep its nesting depth.
 */

/** A recognized contents line, with its leaders cleaned out and its nesting depth. */
export interface ContentsEntry {
  text: string;
  runs: ReflowRun[];
  /** Nesting depth on the page, 0 for the outermost entries. */
  level: number;
}

/** Four or more leader characters in a row, e.g. ". . . . ." or "……". */
const LEADER = /\s*[.…·](?:\s*[.…·]){3,}\s*/;
const ARABIC_PAGE = /^\d{1,4}$/;
const ROMAN_PAGE = /^(?=.)(?:x{0,3}(?:ix|iv|v?i{0,3})|X{0,3}(?:IX|IV|V?I{0,3}))$/;
/** Longest line still plausible as a contents entry; longer ones are body text. */
const MAX_ENTRY_LENGTH = 160;
/** Leader-style entries a page needs to be recognized as a contents page on its own. */
const MIN_LEADER_ENTRIES = 2;
/** Without leaders, a page needs this many entries making up at least `MIN_ENTRY_SHARE` of its lines. */
const MIN_PLAIN_ENTRIES = 5;
const MIN_ENTRY_SHARE = 0.6;
/** Entries closer than this (× font size) in x share one nesting level. */
const LEVEL_TOLERANCE_RATIO = 0.4;
const MAX_LEVEL = 4;

function endsWithPageLabel(text: string): boolean {
  const label = text.slice(text.lastIndexOf(' ') + 1);
  return text.includes(' ') && (ARABIC_PAGE.test(label) || ROMAN_PAGE.test(label));
}

function hasLeaderEntry(text: string): boolean {
  return LEADER.test(text) && endsWithPageLabel(text.replace(LEADER, ' ').trimEnd());
}

function looksLikeEntry(text: string): boolean {
  return text.length <= MAX_ENTRY_LENGTH && (hasLeaderEntry(text) || endsWithPageLabel(text));
}

/**
 * Replaces the `[start, end)` character range of a line's runs with a neutral
 * `replacement`, keeping the invariant that runs join back to the line text.
 */
function spliceRuns(runs: ReflowRun[], start: number, end: number, replacement: string): ReflowRun[] {
  const out: ReflowRun[] = [];
  const push = (text: string, bold: boolean, italic: boolean): void => {
    if (text === '') return;
    const last = out[out.length - 1];
    if (last && last.bold === bold && last.italic === italic) last.text += text;
    else out.push({ text, bold, italic });
  };
  let offset = 0;
  let inserted = false;
  for (const run of runs) {
    const runEnd = offset + run.text.length;
    push(run.text.slice(0, Math.max(0, Math.min(run.text.length, start - offset))), run.bold, run.italic);
    if (!inserted && runEnd >= start) {
      push(replacement, false, false);
      inserted = true;
    }
    push(run.text.slice(Math.max(0, Math.min(run.text.length, end - offset))), run.bold, run.italic);
    offset = runEnd;
  }
  return out;
}

function stripLeaders(line: ReflowLine): { text: string; runs: ReflowRun[] } {
  const match = LEADER.exec(line.text);
  if (match === null) return { text: line.text, runs: line.runs };
  const start = match.index;
  const end = start + match[0].length;
  return {
    text: `${line.text.slice(0, start)} … ${line.text.slice(end)}`,
    runs: spliceRuns(line.runs, start, end, ' … '),
  };
}

/** Maps each x position to its nesting level: positions within tolerance of one another share a level. */
function assignLevels(xs: number[], tolerance: number): Map<number, number> {
  const sorted = [...new Set(xs)].sort((a, b) => a - b);
  const levels = new Map<number, number>();
  let level = 0;
  sorted.forEach((x, index) => {
    if (index > 0 && x - sorted[index - 1] > tolerance) level++;
    levels.set(x, Math.min(level, MAX_LEVEL));
  });
  return levels;
}

function isContentsPage(lines: ReflowLine[], entryFlags: boolean[]): boolean {
  const leaderEntries = lines.filter((line, index) => entryFlags[index] && hasLeaderEntry(line.text)).length;
  if (leaderEntries >= MIN_LEADER_ENTRIES) return true;
  const entries = entryFlags.filter(Boolean).length;
  return entries >= MIN_PLAIN_ENTRIES && entries / lines.length >= MIN_ENTRY_SHARE;
}

/**
 * Finds the table-of-contents entries among one page's lines. A page counts as
 * a contents page when it has several dot-leader entries, or when most of its
 * lines end in a page number; only then are lines ending in a page number
 * treated as entries, so a body line that happens to end in a digit is left
 * alone on ordinary pages.
 *
 * @param lines The page's lines, top to bottom.
 * @returns One item per line: its cleaned entry, or null when it is not one.
 */
export function detectContentsEntries(lines: ReflowLine[]): Array<ContentsEntry | null> {
  const entryFlags = lines.map((line) => !line.isTable && looksLikeEntry(line.text));
  if (lines.length === 0 || !isContentsPage(lines, entryFlags)) return lines.map(() => null);

  const entryLines = lines.filter((_, index) => entryFlags[index]);
  const tolerance = LEVEL_TOLERANCE_RATIO * Math.max(...entryLines.map((line) => line.fontSize));
  const levels = assignLevels(entryLines.map((line) => line.x), tolerance);

  return lines.map((line, index) => {
    if (!entryFlags[index]) return null;
    return { ...stripLeaders(line), level: levels.get(line.x) ?? 0 };
  });
}
