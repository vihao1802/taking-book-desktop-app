import { describe, expect, it } from 'vitest';
import {
  assignImagePositions,
  extractLines,
  filterBoilerplateParagraphs,
  paragraphsFromLines,
  reflowPage,
  type ReflowImage,
  type ReflowParagraph,
  type ReflowTextItem,
} from '../src';

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

  it('drops duplicate fragments at the same origin (PDF text-layer artefact)', () => {
    const lines = extractLines([
      item('reated in Master PDF Editor', 575.7, 41.5, { width: 946.7 }),
      item('reated in Master PDF Editor', 575.7, 41.5, { width: 946.7 }),
      item('reated in Master PDF Editor', 575.7, 41.5, { width: 946.7 }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('reated in Master PDF Editor');
  });

  it('keeps the widest fragment when overlapping copies share an origin', () => {
    const lines = extractLines([
      item('漢字', 682.9, 413.4, { width: 96 }),
      item('漢', 682.9, 413.4, { width: 48 }),
      item('漢', 682.9, 413.4, { width: 48 }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('漢字');
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

describe('filterBoilerplateParagraphs', () => {
  function para(text: string, pageIndex: number): ReflowParagraph {
    return { text, fontSize: 12, indent: false, pageIndex, y: 0 };
  }

  it('drops a watermark that repeats on most pages', () => {
    const list: ReflowParagraph[] = [];
    for (let page = 0; page < 10; page++) {
      list.push(para(`Created in Master PDF Editor`, page));
      list.push(para(`Actual content on page ${page + 1}`, page));
    }
    const result = filterBoilerplateParagraphs(list);
    expect(result.some((p) => p.text === 'Created in Master PDF Editor')).toBe(false);
    expect(result.some((p) => p.text.includes('Actual content'))).toBe(true);
  });

  it('keeps text that appears on too few pages', () => {
    const list: ReflowParagraph[] = [];
    for (let page = 0; page < 10; page++) {
      list.push(para(`unique content page ${page + 1}`, page));
    }
    list.push(para('Created in Master PDF Editor', 0));
    list.push(para('Created in Master PDF Editor', 2));
    const result = filterBoilerplateParagraphs(list);
    expect(result.some((p) => p.text === 'Created in Master PDF Editor')).toBe(true);
  });

  it('keeps short repeated lines (not long enough to be a watermark)', () => {
    const list = [para('hi', 0), para('hi', 1), para('hi', 2), para('hi', 3), para('hi', 4)];
    const result = filterBoilerplateParagraphs(list);
    expect(result).toHaveLength(5);
  });

  it('does nothing for a single-page document', () => {
    const list = [para('Created in Master PDF Editor', 0)];
    expect(filterBoilerplateParagraphs(list)).toEqual(list);
  });
});

describe('assignImagePositions', () => {
  function para(text: string, pageIndex: number, y: number): ReflowParagraph {
    return { text, fontSize: 12, indent: false, pageIndex, y };
  }

  function img(pageIndex: number, y: number, ref = 'img'): ReflowImage {
    return { pageIndex, x: 0, y, width: 100, height: 50, ref };
  }

  it('places an image before the first paragraph at or below its y on the same page', () => {
    const paragraphs = [para('top', 0, 100), para('bottom', 0, 300)];
    const positioned = assignImagePositions(paragraphs, [img(0, 200)]);
    expect(positioned).toHaveLength(1);
    expect(positioned[0].beforeParagraphIndex).toBe(1);
  });

  it('collapses a side-by-side figure to image-first when the text shares its band', () => {
    const paragraphs = [para('beside', 0, 110)];
    const positioned = assignImagePositions(paragraphs, [img(0, 100)]);
    expect(positioned[0].beforeParagraphIndex).toBe(0);
  });

  it('moves an image below all same-page text to the start of the next page', () => {
    const paragraphs = [para('page one', 0, 100), para('page two', 1, 50)];
    const positioned = assignImagePositions(paragraphs, [img(0, 500)]);
    expect(positioned[0].beforeParagraphIndex).toBe(1);
  });

  it('anchors an image after the last paragraph to the end of the flow', () => {
    const paragraphs = [para('only', 0, 100)];
    const positioned = assignImagePositions(paragraphs, [img(0, 900)]);
    expect(positioned[0].beforeParagraphIndex).toBe(1);
  });

  it('keeps images sharing an anchor in top-to-bottom order', () => {
    const paragraphs = [para('below', 0, 300)];
    const positioned = assignImagePositions(paragraphs, [img(0, 220, 'second'), img(0, 200, 'first')]);
    expect(positioned.map((p) => p.ref)).toEqual(['first', 'second']);
    expect(positioned.every((p) => p.beforeParagraphIndex === 0)).toBe(true);
  });

  it('leaves the paragraph list and input images untouched', () => {
    const paragraphs = [para('top', 0, 100)];
    const images = [img(0, 50)];
    assignImagePositions(paragraphs, images);
    expect('beforeParagraphIndex' in images[0]).toBe(false);
    expect(paragraphs).toHaveLength(1);
  });
});
