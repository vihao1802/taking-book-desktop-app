import { describe, expect, it } from 'vitest';
import {
  REFLOW_TARGET_FONT_SIZE,
  assignImagePositions,
  dominantFontSize,
  extractLines,
  filterBoilerplateParagraphs,
  fontStyleFromName,
  normalizeReflowSizes,
  paragraphsFromLines,
  reflowPage,
  type ReflowImage,
  type ReflowLine,
  type ReflowParagraph,
  type ReflowRun,
  type ReflowTextItem,
} from '../src';

const FONT = 12;

function item(str: string, x: number, y: number, opts: Partial<ReflowTextItem> = {}): ReflowTextItem {
  return { str, x, y, width: str.length * 6, fontSize: FONT, ...opts };
}

function line(text: string, y: number, x = 0, fontSize = FONT, runs?: ReflowRun[]): ReflowLine {
  return { x, y, fontSize, text, runs: runs ?? [{ text, bold: false, italic: false }] };
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

  it('carries bold and italic onto the line runs', () => {
    const lines = extractLines([
      item('bold', 0, 100, { bold: true }),
      item('plain', 90, 100),
      item('slant', 160, 100, { italic: true }),
    ]);
    expect(lines[0].runs).toEqual([
      { text: 'bold', bold: true, italic: false },
      { text: ' plain ', bold: false, italic: false },
      { text: 'slant', bold: false, italic: true },
    ]);
  });

  it('coalesces adjacent fragments with the same style into one run', () => {
    const lines = extractLines([
      item('He', 0, 100, { bold: true }),
      item('llo', 10, 100, { bold: true }),
    ]);
    expect(lines[0].runs).toEqual([{ text: 'Hello', bold: true, italic: false }]);
  });

  it('keeps runs joined to the line text when whitespace collapses', () => {
    const lines = extractLines([
      item('a ', 0, 100, { bold: true }),
      item(' b', 60, 100, { italic: true }),
    ]);
    expect(lines[0].text).toBe('a b');
    expect(lines[0].runs.map((r) => r.text).join('')).toBe(lines[0].text);
    expect(lines[0].runs).toEqual([
      { text: 'a', bold: true, italic: false },
      { text: ' ', bold: false, italic: false },
      { text: 'b', bold: false, italic: true },
    ]);
  });
});

describe('paragraphsFromLines', () => {
  it('keeps consecutive lines in one paragraph', () => {
    const paragraphs = paragraphsFromLines(
      [
        line('line one', 100),
        line('line two', 115),
      ],
      0,
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].text).toBe('line one line two');
  });

  it('starts a new paragraph after a large vertical gap', () => {
    const paragraphs = paragraphsFromLines(
      [
        line('first para', 100),
        line('second para', 200),
      ],
      0,
    );
    expect(paragraphs.map((p) => p.text)).toEqual(['first para', 'second para']);
  });

  it('marks an indented first line as a new paragraph', () => {
    const paragraphs = paragraphsFromLines(
      [
        line('flow text', 100),
        line('indented start', 115, 20),
      ],
      0,
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1].indent).toBe(true);
  });

  it('starts a new paragraph on a font-size change', () => {
    const paragraphs = paragraphsFromLines(
      [
        line('Heading', 100, 0, 24),
        line('Body text', 130),
      ],
      0,
    );
    expect(paragraphs.map((p) => p.text)).toEqual(['Heading', 'Body text']);
    expect(paragraphs[0].fontSize).toBe(24);
  });

  it('tags paragraphs with the page index', () => {
    const paragraphs = paragraphsFromLines(
      [line('p2', 100)],
      1,
    );
    expect(paragraphs[0].pageIndex).toBe(1);
  });

  it('joins runs across consecutive lines, keeping the space between them', () => {
    const paragraphs = paragraphsFromLines(
      [
        line('line one', 100, 0, FONT, [{ text: 'line one', bold: true, italic: false }]),
        line('line two', 115, 0, FONT, [{ text: 'line two', bold: false, italic: true }]),
      ],
      0,
    );
    expect(paragraphs[0].text).toBe('line one line two');
    expect(paragraphs[0].runs.map((r) => r.text).join('')).toBe(paragraphs[0].text);
    expect(paragraphs[0].runs).toEqual([
      { text: 'line one', bold: true, italic: false },
      { text: ' ', bold: false, italic: false },
      { text: 'line two', bold: false, italic: true },
    ]);
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

  it('preserves the joined text while carrying styles through the pipeline', () => {
    const styled = reflowPage(
      [
        item('The', 0, 100, { bold: true }),
        item('quick', 30, 100, { bold: true }),
        item('brown', 80, 100),
        item('fox', 130, 100, { italic: true }),
        item('jumps', 0, 118),
        item('over', 40, 118),
      ],
      0,
    );
    const plain = reflowPage(
      [
        item('The', 0, 100),
        item('quick', 30, 100),
        item('brown', 80, 100),
        item('fox', 130, 100),
        item('jumps', 0, 118),
        item('over', 40, 118),
      ],
      0,
    );
    expect(styled.map((p) => p.text)).toEqual(plain.map((p) => p.text));
    expect(styled.map((p) => p.text)).toEqual(['The quick brown fox jumps over']);
    for (const p of styled) {
      expect(p.runs.map((r) => r.text).join('')).toBe(p.text);
    }
    expect(styled[0].runs.some((r) => r.bold && r.text.includes('quick'))).toBe(true);
    expect(styled[0].runs.some((r) => r.italic && r.text.includes('fox'))).toBe(true);
  });
});

describe('fontStyleFromName', () => {
  it('flags a Bold font name', () => {
    expect(fontStyleFromName('Helvetica-Bold')).toEqual({ bold: true, italic: false });
  });

  it('flags an italic font name', () => {
    expect(fontStyleFromName('Times-Italic')).toEqual({ bold: false, italic: true });
  });

  it('flags a bold-italic font name', () => {
    expect(fontStyleFromName('Times-BoldItalicMT')).toEqual({ bold: true, italic: true });
  });

  it('treats oblique as italic', () => {
    expect(fontStyleFromName('Arial-Oblique')).toEqual({ bold: false, italic: true });
  });

  it('leaves a regular font name unflagged', () => {
    expect(fontStyleFromName('Helvetica')).toEqual({ bold: false, italic: false });
  });

  it('is case-insensitive', () => {
    expect(fontStyleFromName('arial-boldmt')).toEqual({ bold: true, italic: false });
  });

  it('is unflagged when the font is unknown', () => {
    expect(fontStyleFromName(null)).toEqual({ bold: false, italic: false });
  });
});

describe('dominantFontSize', () => {
  function para(text: string, fontSize: number): ReflowParagraph {
    return { text, fontSize, indent: false, pageIndex: 0, y: 0, runs: [{ text, bold: false, italic: false }] };
  }

  it('returns null for an empty document', () => {
    expect(dominantFontSize([])).toBeNull();
  });

  it('picks the font size carrying the most text, not the most paragraphs', () => {
    const paragraphs = [
      para('Heading', 24),
      para('Sub', 18),
      para('body body body body body body body body', 12),
      para('body body body body body body body body', 12),
    ];
    expect(dominantFontSize(paragraphs)).toBe(12);
  });

  it('breaks a length tie toward the smaller size', () => {
    const paragraphs = [para('aaaa', 14), para('bbbb', 10)];
    expect(dominantFontSize(paragraphs)).toBe(10);
  });

  it('returns the only size present', () => {
    expect(dominantFontSize([para('text', 15)])).toBe(15);
  });
});

describe('normalizeReflowSizes', () => {
  function para(text: string, fontSize: number): ReflowParagraph {
    return { text, fontSize, indent: false, pageIndex: 0, y: 0, runs: [{ text, bold: false, italic: false }] };
  }

  it('scales so the dominant size lands on the 20px target', () => {
    const out = normalizeReflowSizes([para('body text here', 12), para('Heading', 24)]);
    expect(out[0].fontSize).toBeCloseTo(REFLOW_TARGET_FONT_SIZE);
    expect(out[1].fontSize).toBeCloseTo(REFLOW_TARGET_FONT_SIZE * 2);
  });

  it('accepts a custom target size', () => {
    const out = normalizeReflowSizes([para('body', 10)], 25);
    expect(out[0].fontSize).toBeCloseTo(25);
  });

  it('shrinks a document whose dominant size exceeds the target', () => {
    const out = normalizeReflowSizes([para('body body body body', 28), para('Heading', 40)]);
    expect(out[0].fontSize).toBeCloseTo(20);
    expect(out[1].fontSize).toBeCloseTo(20 * (40 / 28));
  });

  it('keeps text and runs untouched', () => {
    const out = normalizeReflowSizes([para('body text', 12)]);
    expect(out[0].text).toBe('body text');
    expect(out[0].runs.map((r) => r.text).join('')).toBe('body text');
  });

  it('does not mutate the input paragraphs', () => {
    const input = [para('body', 12)];
    const out = normalizeReflowSizes(input);
    expect(input[0].fontSize).toBe(12);
    expect(out[0]).not.toBe(input[0]);
  });

  it('returns the empty list unchanged', () => {
    expect(normalizeReflowSizes([])).toEqual([]);
  });
});

describe('filterBoilerplateParagraphs', () => {
  function para(text: string, pageIndex: number): ReflowParagraph {
    return { text, fontSize: 12, indent: false, pageIndex, y: 0, runs: [{ text, bold: false, italic: false }] };
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

describe('table detection', () => {
  function cell(str: string, x: number, y: number, fontSize = 9): ReflowTextItem {
    return { str, x, y, width: 30, fontSize };
  }

  it('flags aligned multi-column rows as table lines', () => {
    const lines = extractLines([
      cell('Name', 0, 100),
      cell('Age', 150, 100),
      cell('City', 300, 100),
      cell('Ann', 0, 115),
      cell('30', 150, 115),
      cell('Oslo', 300, 115),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].isTable).toBe(true);
    expect(lines[1].isTable).toBe(true);
  });

  it('leaves ordinary body text unflagged', () => {
    const lines = extractLines([
      item('hello', 0, 100),
      item('world', 34, 100),
      item('next line', 0, 115),
    ]);
    expect(lines.every((l) => l.isTable !== true)).toBe(true);
  });

  it('does not flag a lone three-column line without an aligned neighbor', () => {
    const lines = extractLines([
      cell('A', 0, 100),
      cell('B', 150, 100),
      cell('C', 300, 100),
      item('body text continues here', 0, 200),
    ]);
    expect(lines[0].isTable).not.toBe(true);
  });

  it('keeps each table row as its own paragraph so rows never merge into body text', () => {
    const paragraphs = reflowPage(
      [
        cell('Name', 0, 100),
        cell('Age', 150, 100),
        cell('City', 300, 100),
        cell('Ann', 0, 115),
        cell('30', 150, 115),
        cell('Oslo', 300, 115),
      ],
      0,
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].isTable).toBe(true);
    expect(paragraphs[1].isTable).toBe(true);
  });

  it('excludes table paragraphs from the dominant size', () => {
    function para(text: string, fontSize: number, isTable?: boolean): ReflowParagraph {
      return {
        text,
        fontSize,
        indent: false,
        pageIndex: 0,
        y: 0,
        runs: [{ text, bold: false, italic: false }],
        ...(isTable ? { isTable: true as const } : {}),
      };
    }
    const paragraphs = [
      para('body body body body body', 12),
      para('Name Age City', 9, true),
      para('Ann 30 Oslo', 9, true),
    ];
    expect(dominantFontSize(paragraphs)).toBe(12);
  });

  it('leaves table font sizes untouched while scaling body text', () => {
    function para(text: string, fontSize: number, isTable?: boolean): ReflowParagraph {
      return {
        text,
        fontSize,
        indent: false,
        pageIndex: 0,
        y: 0,
        runs: [{ text, bold: false, italic: false }],
        ...(isTable ? { isTable: true as const } : {}),
      };
    }
    const out = normalizeReflowSizes([para('body body body', 12), para('Name Age City', 9, true)]);
    expect(out[0].fontSize).toBeCloseTo(REFLOW_TARGET_FONT_SIZE);
    expect(out[1].fontSize).toBeCloseTo(9);
  });
});

describe('assignImagePositions', () => {
  function para(text: string, pageIndex: number, y: number): ReflowParagraph {
    return { text, fontSize: 12, indent: false, pageIndex, y, runs: [{ text, bold: false, italic: false }] };
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
