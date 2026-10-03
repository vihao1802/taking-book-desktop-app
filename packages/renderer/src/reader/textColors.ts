import { OPS } from 'pdfjs-dist';
import type { ColoredText } from '@taking-book/core';
import type { ReflowOperatorList } from './reflowImages';

/** Painting state that nests: a restore (or the end of a form) brings back the color before it. */
const STATE_PUSH_OPS: ReadonlySet<number> = new Set([OPS.save, OPS.paintFormXObjectBegin]);
const STATE_POP_OPS: ReadonlySet<number> = new Set([OPS.restore, OPS.paintFormXObjectEnd]);

/** Fill color a page starts with; PDF's initial fill is black. */
const INITIAL_FILL = '#000000';

interface GlyphLike {
  unicode?: unknown;
}

/**
 * Pulls the glyph list out of a text-showing operator's arguments. The shapes
 * differ per operator: `showText` and `nextLineShowText` carry the glyphs
 * first, `showSpacedText` interleaves glyphs with kerning numbers, and
 * `nextLineSetSpacingShowText` puts them after the two spacing values.
 */
function glyphsOf(fn: number, args: unknown): unknown[] | null {
  if (!Array.isArray(args)) return null;
  if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText) {
    return Array.isArray(args[0]) ? args[0] : null;
  }
  if (fn === OPS.nextLineSetSpacingShowText) return Array.isArray(args[2]) ? args[2] : null;
  return null;
}

function textOfGlyphs(glyphs: unknown[]): string {
  let text = '';
  for (const glyph of glyphs) {
    const unicode = (glyph as GlyphLike | null)?.unicode;
    if (typeof unicode === 'string') text += unicode;
  }
  return text;
}

/** A fill color operator's `#rrggbb` argument; pdf.js normalizes every color space to it. */
function fillColorOf(args: unknown): string | null {
  const color = Array.isArray(args) ? args[0] : null;
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
}

/**
 * Reads the color each run of text on a page is painted with, in painting
 * order (which is also the order `getTextContent` reports fragments in). The
 * fill color follows the graphics state, so it is restored by `restore` and by
 * the end of a form. Pattern and shading fills carry no plain color and leave
 * the current one in place.
 *
 * @param opList - The page's pdf.js operator list.
 * @returns Painted text stretches, adjacent ones of the same color merged.
 */
export function extractTextColors(opList: ReflowOperatorList): ColoredText[] {
  const stream: ColoredText[] = [];
  const saved: string[] = [];
  let fill = INITIAL_FILL;
  opList.fnArray.forEach((fn, index) => {
    const args = opList.argsArray[index];
    if (STATE_PUSH_OPS.has(fn)) {
      saved.push(fill);
    } else if (STATE_POP_OPS.has(fn)) {
      fill = saved.pop() ?? fill;
    } else if (fn === OPS.setFillRGBColor) {
      fill = fillColorOf(args) ?? fill;
    } else {
      const glyphs = glyphsOf(fn, args);
      const text = glyphs ? textOfGlyphs(glyphs) : '';
      if (text === '') return;
      const last = stream[stream.length - 1];
      if (last && last.color === fill) last.text += text;
      else stream.push({ text, color: fill });
    }
  });
  return stream;
}
