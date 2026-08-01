import { describe, expect, it } from 'vitest';
import { extractLines, paragraphsFromLines, reflowPage, type ReflowTextItem } from '../src';

const FONT = 12;

function item(str: string, x: number, y: number, opts: Partial<ReflowTextItem> = {}): ReflowTextItem {
  return { str, x, y, width: str.length * 6, fontSize: FONT, ...opts };
}

describe('extractLines', () => {
  it('groups fragments on the same baseline into one line, left-to-right', () => {
    const lines = extractLines([
      item('world', 60, 100),
      item('hello', 0, 100),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('hello world');
  });

  it('does not merge fragments on different baselines', () => {
    const lines = extractLines([
      item('second', 0, 120),
      item('first', 0, 100),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['first', 'second']);
  });

  it('joins fragments with a space when the gap implies a word boundary', () => {
    const lines = extractLines([item('a', 0, 100), item('b', 60, 100)]);
    expect(lines[0].text).toBe('a b');
  });

  it('does not insert extra spaces around existing whitespace', () => {
    const lines = extractLines([item('a ', 0, 100), item(' b', 60, 100)]);
    expect(lines[0].text).toBe('a b');
  });

  it('reports the maximum font size on a mixed line', () => {
    const lines = extractLines([item('big', 0, 100, { fontSize: 24 }), item('small', 80, 100)]);
    expect(lines[0].fontSize).toBe(24);
  });
});

describe('paragraphsFromLines', () => {
  it('keeps consecutive lines in one paragraph', () => {
    const paragraphs = paragraphsFromLines(
      [
        { x: 0, y: 100, fontSize: FONT, text: 'line one' },
        { x: 0, y: 115, fontSize: FONT, text: 'line two' },
      ],
      0,
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe('line one line two');
  });

  it('starts a new paragraph after a large vertical gap', () => {
    const paragraphs = paragraphsFromLines(
      [
        { x: 0, y: 100, fontSize: FONT, text: 'first para' },
        { x: 0, y: 200, fontSize: FONT, text: 'second para' },
      ],
      0,
    );
    expect(paragraphs.map((p) => p.text)).toEqual(['first para', 'second para']);
  });

  it('marks an indented first line as a new paragraph', () => {
    const paragraphs = paragraphsFromLines(
      [
        { x: 0, y: 100, fontSize: FONT, text: 'flow text' },
        { x: 20, y: 115, fontSize: FONT, text: 'indented start' },
      ],
      0,
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1].indent).toBe(true);
  });

  it('starts a new paragraph on a font-size change', () => {
    const paragraphs = paragraphsFromLines(
      [
        { x: 0, y: 100, fontSize: 24, text: 'Heading' },
        { x: 0, y: 130, fontSize: FONT, text: 'Body text' },
      ],
      0,
    );
    expect(paragraphs.map((p) => p.text)).toEqual(['Heading', 'Body text']);
    expect(paragraphs[0].fontSize).toBe(24);
  });

  it('tags paragraphs with the page index', () => {
    const paragraphs = paragraphsFromLines(
      [{ x: 0, y: 100, fontSize: FONT, text: 'p2' }],
      1,
    );
    expect(paragraphs[0].pageIndex).toBe(1);
  });
});

describe('reflowPage', () => {
  it('runs the full pipeline', () => {
    const paragraphs = reflowPage(
      [
        item('First', 0, 100),
        item('paragraph', 34, 100),
        item('next line', 0, 118),
        item('New', 20, 200),
        item('paragraph', 42, 200),      ],
      0,
    );
    expect(paragraphs.map((p) => p.text)).toEqual(['First paragraph next line', 'New paragraph']);
    expect(paragraphs[0].indent).toBe(false);
    expect(paragraphs[1].indent).toBe(true);
  });
});
