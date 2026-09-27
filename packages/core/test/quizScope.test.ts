import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIZ_SCOPE_PAGES, isErr, isOk, isQuizSize, resolveQuizScope } from '../src/index';

describe('resolveQuizScope', () => {
  it('defaults to the most recent DEFAULT_QUIZ_SCOPE_PAGES pages, ending at the Last-read position', () => {
    const result = resolveQuizScope(50);
    expect(isOk(result) && result.data).toEqual({
      startPage: 50 - DEFAULT_QUIZ_SCOPE_PAGES + 1,
      endPage: 50,
    });
  });

  it('clamps the default start to page 1 for a book read only a few pages in', () => {
    const result = resolveQuizScope(3);
    expect(isOk(result) && result.data).toEqual({ startPage: 1, endPage: 3 });
  });

  it('widens the scope to a reader-chosen earlier start page', () => {
    const result = resolveQuizScope(50, 10);
    expect(isOk(result) && result.data).toEqual({ startPage: 10, endPage: 50 });
  });

  it('rejects a start page past the Last-read position', () => {
    const result = resolveQuizScope(10, 11);
    expect(isErr(result) && result.error).toMatch(/cannot start past/);
  });

  it('rejects a non-positive start page', () => {
    const result = resolveQuizScope(10, 0);
    expect(isErr(result)).toBe(true);
  });

  it('rejects a book with no read progress', () => {
    const result = resolveQuizScope(0);
    expect(isErr(result) && result.error).toMatch(/no read progress/);
  });
});

describe('isQuizSize', () => {
  it('accepts every offered Quiz size', () => {
    expect(isQuizSize(5)).toBe(true);
    expect(isQuizSize(10)).toBe(true);
    expect(isQuizSize(15)).toBe(true);
  });

  it('rejects a size that is not offered', () => {
    expect(isQuizSize(2)).toBe(false);
    expect(isQuizSize(20)).toBe(false);
  });
});
