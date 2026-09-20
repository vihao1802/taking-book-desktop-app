import { describe, expect, it } from 'vitest';
import { paragraphsFromLines, type ReflowLine, type ReflowRun } from '../src';
import { detectContentsEntries } from '../src/reflowContents';

const FONT = 11;

function line(text: string, y: number, x = 0, runs?: ReflowRun[]): ReflowLine {
  return {
    x,
    right: x + text.length * 6,
    y,
    fontSize: FONT,
    text,
    runs: runs ?? [{ text, bold: false, italic: false }],
  };
}

const CONTENTS_PAGE: ReflowLine[] = [
  line('1. Reliable Applications . . . . . . . . . . . 3', 100, 73),
  line('Thinking About Data Systems 6', 113, 86),
  line('Reliability 7', 126, 95),
  line('2. Data Models . . . . . . . . . . . . 27', 150, 73),
  line('Query Languages for Data 42', 163, 86),
];

describe('detectContentsEntries', () => {
  it('recognizes leader entries and plain "title page" entries on a contents page', () => {
    const entries = detectContentsEntries(CONTENTS_PAGE);
    expect(entries.every((entry) => entry !== null)).toBe(true);
  });

  it('drops dot leaders and reports where the page label starts', () => {
    const [first] = detectContentsEntries(CONTENTS_PAGE);
    expect(first?.text).toBe('1. Reliable Applications 3');
    expect(first?.text.slice(first?.pageStart)).toBe('3');
  });

  it('finds the page label of an entry that never had leaders', () => {
    const entries = detectContentsEntries(CONTENTS_PAGE);
    expect(entries[1]?.text.slice(entries[1]?.pageStart)).toBe('6');
  });

  it('keeps runs joined to the cleaned text, preserving bold', () => {
    const runs: ReflowRun[] = [
      { text: '1. ', bold: true, italic: false },
      { text: 'Reliable . . . . . . 3', bold: false, italic: false },
    ];
    const entries = detectContentsEntries([
      line('1. Reliable . . . . . . 3', 100, 0, runs),
      line('2. Scalable . . . . . . 9', 113, 0),
    ]);
    expect(entries[0]?.runs.map((run) => run.text).join('')).toBe(entries[0]?.text);
    expect(entries[0]?.runs[0]).toEqual({ text: '1. ', bold: true, italic: false });
  });

  it('assigns nesting levels from x position', () => {
    const levels = detectContentsEntries(CONTENTS_PAGE).map((entry) => entry?.level);
    expect(levels).toEqual([0, 1, 2, 0, 1]);
  });

  it('recognizes roman-numeral page labels', () => {
    const entries = detectContentsEntries([
      line('Preface . . . . . . . . vii', 100),
      line('Foreword . . . . . . . . xi', 113),
    ]);
    expect(entries[0]?.text).toBe('Preface vii');
    expect(entries[0]?.text.slice(entries[0]?.pageStart)).toBe('vii');
  });

  it('leaves body lines ending in a digit alone on an ordinary page', () => {
    const entries = detectContentsEntries([
      line('The committee met in room 12', 100),
      line('and decided to adjourn until the spring.', 113),
      line('Results are listed in Table 3', 126),
    ]);
    expect(entries).toEqual([null, null, null]);
  });

  it('does not treat words that merely look like roman numerals as page labels', () => {
    const entries = detectContentsEntries([
      line('Stories of the civil . . . . . . mix', 100),
      line('Another . . . . . . civil', 113),
    ]);
    expect(entries).toEqual([null, null]);
  });

  it('handles a page with no lines', () => {
    expect(detectContentsEntries([])).toEqual([]);
  });
});

describe('paragraphsFromLines with a contents page', () => {
  it('gives every entry its own paragraph instead of merging them', () => {
    const paragraphs = paragraphsFromLines(CONTENTS_PAGE, 0);
    expect(paragraphs).toHaveLength(CONTENTS_PAGE.length);
    expect(paragraphs.map((paragraph) => paragraph.contents?.level)).toEqual([0, 1, 2, 0, 1]);
    expect(paragraphs[0].text.slice(paragraphs[0].contents?.pageStart)).toBe('3');
  });

  it('keeps a heading above the entries separate from them', () => {
    const paragraphs = paragraphsFromLines(
      [line('Table of Contents', 60, 73), ...CONTENTS_PAGE],
      0,
    );
    expect(paragraphs[0].text).toBe('Table of Contents');
    expect(paragraphs[0].contents).toBeUndefined();
    expect(paragraphs[1].contents?.level).toBe(0);
  });
});
