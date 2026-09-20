import { describe, expect, it } from 'vitest';
import { buildSearchIndex, findMatchesInIndex, findMatchesInTexts, findTextMatches } from '../src/textSearch';

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

describe('buildSearchIndex', () => {
  it('finds the same matches as searching the texts directly', () => {
    const texts = ['one fish', 'no luck', 'Fish  fish', 'İx fish'];
    expect(findMatchesInIndex(buildSearchIndex(texts), 'fish')).toEqual(findMatchesInTexts(texts, 'fish'));
  });

  it('can be searched again with another query', () => {
    const index = buildSearchIndex(['red fish', 'blue fish']);
    expect(findMatchesInIndex(index, 'red')).toHaveLength(1);
    expect(findMatchesInIndex(index, 'fish')).toHaveLength(2);
  });

  it('returns nothing for an empty query', () => {
    expect(findMatchesInIndex(buildSearchIndex(['a', 'b']), ' ')).toEqual([]);
  });

  it('reuses the entries of texts that did not change when a list grows', () => {
    const first = buildSearchIndex(['page one', 'page two']);
    const grown = buildSearchIndex(['page one', 'page two', 'page three'], first);
    expect(grown.entries[0]).toBe(first.entries[0]);
    expect(grown.entries[1]).toBe(first.entries[1]);
    expect(findMatchesInIndex(grown, 'three')).toEqual([{ textIndex: 2, start: 5, end: 10 }]);
  });

  it('normalizes again a text that changed under the same position', () => {
    const first = buildSearchIndex(['old text']);
    const changed = buildSearchIndex(['new text'], first);
    expect(changed.entries[0]).not.toBe(first.entries[0]);
    expect(findMatchesInIndex(changed, 'old')).toEqual([]);
    expect(findMatchesInIndex(changed, 'new')).toHaveLength(1);
  });
});
