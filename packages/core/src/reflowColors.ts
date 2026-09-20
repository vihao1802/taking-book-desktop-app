/**
 * Syntax colors for reflowed code. pdf.js reports text and color separately:
 * fragments come from `getTextContent` without any color, while the color each
 * glyph is painted with only exists in the operator list. This module lines the
 * two up so code keeps its highlighting.
 */

import type { ReflowTextItem } from './reflow';

/** A stretch of painted text and the fill color (`#rrggbb`) it was painted with. */
export interface ColoredText {
  text: string;
  color: string;
}

/** How many painted characters ahead a fragment may skip when its text does not match the stream. */
const RESYNC_LOOKAHEAD = 8;
/** Channel spread (0-255) under which a color counts as a neutral gray. */
const NEUTRAL_SPREAD = 24;
/** Luma (0-255) under which a neutral is near-black ink, and over which it is near-white ink. */
const NEUTRAL_DARK_LUMA = 80;
const NEUTRAL_LIGHT_LUMA = 200;

/**
 * Tells whether a color is a book's plain text ink rather than a highlight:
 * near-black or near-white with no hue. Plain ink is dropped so the reader's
 * own text color applies. A PDF's syntax colors are chosen for its own page
 * background (often dark), so trusting its black or white would make code
 * unreadable on another theme, while its hues are still meaningful.
 *
 * @param color - A `#rrggbb` color.
 * @returns True when the color carries no highlighting information.
 */
export function isPlainInk(color: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return true;
  const [red, green, blue] = [match[1], match[2], match[3]].map((hex) => parseInt(hex, 16));
  if (Math.max(red, green, blue) - Math.min(red, green, blue) >= NEUTRAL_SPREAD) return false;
  const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luma < NEUTRAL_DARK_LUMA || luma > NEUTRAL_LIGHT_LUMA;
}

interface PaintedChar {
  char: string;
  color: string;
}

function flattenStream(stream: ColoredText[]): PaintedChar[] {
  const painted: PaintedChar[] = [];
  for (const { text, color } of stream) {
    for (const char of text) painted.push({ char, color });
  }
  return painted;
}

/**
 * Reads the painted color of each character of a fragment, walking the stream
 * forward. Fragments and the stream are both in content order but not
 * identical: pdf.js inserts spaces where the page only has a gap, and may
 * normalize a character, so a character that does not match resynchronizes by
 * scanning a few painted characters ahead instead of derailing the rest of the
 * page. Characters that cannot be found simply get no color.
 */
function readFragmentColors(
  text: string,
  painted: PaintedChar[],
  start: number,
): { colors: Array<string | undefined>; next: number } {
  const colors: Array<string | undefined> = [];
  let cursor = start;
  for (const char of text) {
    if (painted[cursor]?.char === char) {
      colors.push(painted[cursor].color);
      cursor++;
      continue;
    }
    let found = -1;
    if (char.trim() !== '') {
      const limit = Math.min(painted.length, cursor + RESYNC_LOOKAHEAD + 1);
      for (let ahead = cursor + 1; ahead < limit; ahead++) {
        if (painted[ahead].char === char) {
          found = ahead;
          break;
        }
      }
    }
    if (found === -1) {
      colors.push(undefined);
    } else {
      colors.push(painted[found].color);
      cursor = found + 1;
    }
  }
  return { colors, next: cursor };
}

/**
 * Lets whitespace adopt the color of the token before it (or after it, at the
 * start), so a colored word and its trailing space stay one span.
 */
function fillWhitespaceColors(text: string, colors: Array<string | undefined>): Array<string | undefined> {
  const chars = [...text];
  const filled = [...colors];
  let previous: string | undefined;
  chars.forEach((char, index) => {
    if (char.trim() === '') filled[index] = previous;
    else previous = filled[index];
  });
  const firstInk = chars.findIndex((char) => char.trim() !== '');
  for (let index = 0; index < firstInk; index++) filled[index] = filled[firstInk];
  return filled;
}

/** Cuts a monospace fragment where its color changes, keeping each piece on the character grid. */
function splitByColor(item: ReflowTextItem, colors: Array<string | undefined>): ReflowTextItem[] {
  const chars = [...item.str];
  const pieces: ReflowTextItem[] = [];
  let from = 0;
  while (from < chars.length) {
    let to = from + 1;
    while (to < chars.length && colors[to] === colors[from]) to++;
    const color = colors[from];
    pieces.push({
      ...item,
      str: chars.slice(from, to).join(''),
      x: item.x + (item.width * from) / chars.length,
      width: (item.width * (to - from)) / chars.length,
      ...(color && !isPlainInk(color) ? { color } : {}),
    });
    from = to;
  }
  return pieces;
}

/**
 * Attaches syntax colors to the monospace fragments of a page. Every fragment
 * advances the stream so the alignment holds across prose too, but only code
 * fragments are colored: body text keeps the reader's text color. A fragment
 * that spans several colors (pdf.js merges adjacent chunks) is split so each
 * piece has exactly one.
 *
 * @param items - The page's fragments in content order (the order `getTextContent` returns them).
 * @param stream - The page's painted text in content order, from the operator list.
 * @returns The fragments, with colored code split into single-color pieces.
 */
export function assignCodeColors(items: ReflowTextItem[], stream: ColoredText[]): ReflowTextItem[] {
  if (stream.length === 0) return items;
  const painted = flattenStream(stream);
  const result: ReflowTextItem[] = [];
  let cursor = 0;
  for (const item of items) {
    const read = readFragmentColors(item.str, painted, cursor);
    cursor = read.next;
    if (item.monospace) result.push(...splitByColor(item, fillWhitespaceColors(item.str, read.colors)));
    else result.push(item);
  }
  return result;
}
