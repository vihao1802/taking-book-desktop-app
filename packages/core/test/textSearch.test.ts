import { describe, expect, it } from 'vitest';
import { findMatchesInTexts, findTextMatches } from '../src/textSearch';

describe('findTextMatches', () => {
  it('returns offsets into the original text', () => {
    expect(findTextMatches('the cat sat', 'cat')).toEqual([{ start: 4, end: 7 }]);
  });

  it('matches case-insensitively', () => {
    expect(findTextMatches('Cat CAT cat', 'cAt')).toHaveLength(3);
  });

  it('returns no matches for an empty or blank query', () => {
    expect(findTextMatches('anything', '')).toEqual([]);
    expect(findTextMatches('anything', '   ')).toEqual([]);
  });

  it('returns no matches when the text does not contain the query', () => {
    expect(findTextMatches('the cat sat', 'dog')).toEqual([]);
  });

  it('finds a query typed with a space in text stored without one', () => {
    expect(findTextMatches('thecat sat', 'the cat')).toEqual([{ start: 0, end: 6 }]);
  });

  it('finds a query typed without a space in text that has one', () => {
    expect(findTextMatches('the  cat\nsat', 'thecat')).toEqual([{ start: 0, end: 8 }]);
  });

  it('does not overlap matches', () => {
    expect(findTextMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('keeps offsets correct when a character lowercases to a longer string', () => {
    // "İ".toLowerCase() is two code units; offsets must still point at the original text.
    const text = 'İx target';
    const [match] = findTextMatches(text, 'target');
    expect(text.slice(match.start, match.end)).toBe('target');
  });

  it('matches non-ASCII text', () => {
    expect(findTextMatches('Café ÉCOLE', 'école')).toEqual([{ start: 5, end: 10 }]);
  });
});

describe('findMatchesInTexts', () => {
  it('tags each match with the index of the text it came from, in order', () => {
    const matches = findMatchesInTexts(['one fish', 'no luck', 'fish fish'], 'fish');
    expect(matches).toEqual([
      { textIndex: 0, start: 4, end: 8 },
      { textIndex: 2, start: 0, end: 4 },
      { textIndex: 2, start: 5, end: 9 },
    ]);
  });

  it('returns nothing for an empty query', () => {
    expect(findMatchesInTexts(['a', 'b'], '')).toEqual([]);
  });
});
