import { describe, expect, it } from 'vitest';
import { assignCodeColors, isPlainInk, reflowPage, type ReflowTextItem } from '../src';

const CHAR = 6;

function code(str: string, x = 0, y = 100, opts: Partial<ReflowTextItem> = {}): ReflowTextItem {
  return { str, x, y, width: str.length * CHAR, fontSize: 10, monospace: true, ...opts };
}

describe('isPlainInk', () => {
  it('treats near-black and near-white neutrals as the book plain text', () => {
    expect(isPlainInk('#000000')).toBe(true);
    expect(isPlainInk('#1f2937')).toBe(false);
    expect(isPlainInk('#f3f4f6')).toBe(true);
    expect(isPlainInk('#ffffff')).toBe(true);
  });

  it('keeps hues and mid grays, which carry syntax meaning', () => {
    expect(isPlainInk('#006699')).toBe(false);
    expect(isPlainInk('#cc3300')).toBe(false);
    expect(isPlainInk('#888888')).toBe(false);
  });

  it('treats anything that is not a #rrggbb color as plain', () => {
    expect(isPlainInk('red')).toBe(true);
  });
});

describe('assignCodeColors', () => {
  it('splits a merged fragment where its color changes, keeping pieces on the character grid', () => {
    const [keyword, name] = assignCodeColors(
      [code('if x', 12)],
      [
        { text: 'if ', color: '#006699' },
        { text: 'x', color: '#000088' },
      ],
    );
    expect(keyword).toMatchObject({ str: 'if ', x: 12, width: 3 * CHAR, color: '#006699' });
    expect(name).toMatchObject({ str: 'x', x: 12 + 3 * CHAR, width: CHAR, color: '#000088' });
  });

  it('gives whitespace the color of the token before it', () => {
    const pieces = assignCodeColors(
      [code('if x')],
      [
        { text: 'if', color: '#006699' },
        { text: ' ', color: '#000000' },
        { text: 'x', color: '#000088' },
      ],
    );
    expect(pieces.map((p) => [p.str, p.color])).toEqual([
      ['if ', '#006699'],
      ['x', '#000088'],
    ]);
  });

  it('drops plain ink so the reader theme decides it', () => {
    const [piece] = assignCodeColors([code('x')], [{ text: 'x', color: '#000000' }]);
    expect(piece.color).toBeUndefined();
  });

  it('colors only monospace fragments but still consumes the stream for prose', () => {
    const prose: ReflowTextItem = { str: 'Run ', x: 0, y: 80, width: 24, fontSize: 10 };
    const [proseOut, codeOut] = assignCodeColors(
      [prose, code('ls', 30, 80)],
      [
        { text: 'Run ', color: '#cc0000' },
        { text: 'ls', color: '#006699' },
      ],
    );
    expect(proseOut.color).toBeUndefined();
    expect(codeOut.color).toBe('#006699');
  });

  it('resynchronizes when pdf.js inserted a space the stream does not have', () => {
    const pieces = assignCodeColors(
      [code('a'), code(' b', 20)],
      [
        { text: 'a', color: '#006699' },
        { text: 'b', color: '#cc3300' },
      ],
    );
    expect(pieces.find((p) => p.str.includes('b'))?.color).toBe('#cc3300');
  });

  it('leaves characters uncolored when the stream never has them, without derailing the rest', () => {
    const pieces = assignCodeColors(
      [code('?'), code('z', 10)],
      [{ text: 'z', color: '#cc3300' }],
    );
    expect(pieces[0].color).toBeUndefined();
    expect(pieces[1].color).toBe('#cc3300');
  });

  it('returns the fragments unchanged when the page painted no text', () => {
    const items = [code('x')];
    expect(assignCodeColors(items, [])).toBe(items);
  });
});

describe('colored code runs', () => {
  it('carries colors into the runs while the text stays exact', () => {
    const [paragraph] = reflowPage(
      [code('if', 0, 100, { color: '#006699' }), code('x', 18, 100, { color: '#000088' }), code('y', 24, 100)],
      0,
    );
    expect(paragraph.text).toBe('if xy');
    expect(paragraph.runs.map((r) => [r.text, r.color])).toEqual([
      ['if ', '#006699'],
      ['x', '#000088'],
      ['y', undefined],
    ]);
    expect(paragraph.runs.map((r) => r.text).join('')).toBe(paragraph.text);
  });

  it('merges neighbouring fragments of the same color into one run', () => {
    const [paragraph] = reflowPage(
      [code('a', 0, 100, { color: '#cc3300' }), code('b', 6, 100, { color: '#cc3300' })],
      0,
    );
    expect(paragraph.runs).toHaveLength(1);
    expect(paragraph.runs[0]).toMatchObject({ text: 'ab', color: '#cc3300' });
  });
});
