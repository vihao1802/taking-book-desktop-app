import { describe, expect, it, vi } from 'vitest';

// Numeric OPS constants mirroring pdf.js; the full module needs DOM globals
// that Node lacks, so it is stubbed (same approach as vectorFigures.test.ts).
vi.mock('pdfjs-dist', () => ({
  OPS: {
    save: 10,
    restore: 11,
    showText: 44,
    showSpacedText: 45,
    nextLineShowText: 46,
    nextLineSetSpacingShowText: 47,
    setFillRGBColor: 59,
    paintFormXObjectBegin: 74,
    paintFormXObjectEnd: 75,
  },
}));

import { extractTextColors } from './textColors';

const OPS = {
  save: 10,
  restore: 11,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setFillRGBColor: 59,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
} as const;

function glyphs(text: string): Array<{ unicode: string }> {
  return [...text].map((unicode) => ({ unicode }));
}

function list(...ops: Array<[number, unknown]>): { fnArray: number[]; argsArray: unknown[] } {
  return { fnArray: ops.map(([fn]) => fn), argsArray: ops.map(([, args]) => args) };
}

describe('extractTextColors', () => {
  it('starts black and follows fill color changes', () => {
    const stream = extractTextColors(
      list(
        [OPS.showText, [glyphs('a')]],
        [OPS.setFillRGBColor, ['#006699']],
        [OPS.showText, [glyphs('b')]],
      ),
    );
    expect(stream).toEqual([
      { text: 'a', color: '#000000' },
      { text: 'b', color: '#006699' },
    ]);
  });

  it('merges adjacent text of one color, as when a page paints one glyph per operator', () => {
    const stream = extractTextColors(
      list([OPS.showText, [glyphs('a')]], [OPS.showText, [glyphs('b')]], [OPS.showText, [glyphs('c')]]),
    );
    expect(stream).toEqual([{ text: 'abc', color: '#000000' }]);
  });

  it('restores the color that was active before a save', () => {
    const stream = extractTextColors(
      list(
        [OPS.save, []],
        [OPS.setFillRGBColor, ['#cc3300']],
        [OPS.showText, [glyphs('a')]],
        [OPS.restore, []],
        [OPS.showText, [glyphs('b')]],
      ),
    );
    expect(stream.map((s) => s.color)).toEqual(['#cc3300', '#000000']);
  });

  it('scopes a form XObject like a save and restore', () => {
    const stream = extractTextColors(
      list(
        [OPS.paintFormXObjectBegin, []],
        [OPS.setFillRGBColor, ['#cc3300']],
        [OPS.paintFormXObjectEnd, []],
        [OPS.showText, [glyphs('a')]],
      ),
    );
    expect(stream[0].color).toBe('#000000');
  });

  it('reads glyphs from every text operator shape, skipping kerning numbers', () => {
    const stream = extractTextColors(
      list(
        [OPS.showSpacedText, [[...glyphs('a'), -120, ...glyphs('b')]]],
        [OPS.nextLineShowText, [glyphs('c')]],
        [OPS.nextLineSetSpacingShowText, [0, 0, glyphs('d')]],
      ),
    );
    expect(stream).toEqual([{ text: 'abcd', color: '#000000' }]);
  });

  it('ignores a fill color that is not a plain hex value', () => {
    const stream = extractTextColors(
      list([OPS.setFillRGBColor, [[1, 2, 3]]], [OPS.showText, [glyphs('a')]]),
    );
    expect(stream[0].color).toBe('#000000');
  });
});
