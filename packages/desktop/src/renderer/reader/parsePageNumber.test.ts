import { describe, expect, it } from 'vitest';
import { parsePageNumber } from './parsePageNumber';

describe('parsePageNumber', () => {
  it('accepts whole numbers within range, ignoring surrounding whitespace', () => {
    expect(parsePageNumber('5', 10)).toBe(5);
    expect(parsePageNumber(' 5 ', 10)).toBe(5);
    expect(parsePageNumber('1', 10)).toBe(1);
    expect(parsePageNumber('10', 10)).toBe(10);
  });

  it('rejects out-of-range numbers', () => {
    expect(parsePageNumber('0', 10)).toBeNull();
    expect(parsePageNumber('11', 10)).toBeNull();
    expect(parsePageNumber('1', 0)).toBeNull();
  });

  it('rejects input that is not a plain whole number', () => {
    expect(parsePageNumber('', 10)).toBeNull();
    expect(parsePageNumber('-3', 10)).toBeNull();
    expect(parsePageNumber('2.5', 10)).toBeNull();
    expect(parsePageNumber('abc', 10)).toBeNull();
    expect(parsePageNumber('1e1', 10)).toBeNull();
  });
});
