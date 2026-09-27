import { describe, expect, it } from 'vitest';
import { defaultSizeChoice, isSizeChoice, quizSizeOptions } from './quizSizeChoice';

describe('quizSizeChoice', () => {
  it('offers 5, 10 and 15 questions, in that order', () => {
    expect(quizSizeOptions()).toEqual([5, 10, 15]);
  });

  it('defaults to 10 questions', () => {
    expect(defaultSizeChoice()).toBe(10);
  });

  it('accepts every offered size', () => {
    expect(isSizeChoice(5)).toBe(true);
    expect(isSizeChoice(10)).toBe(true);
    expect(isSizeChoice(15)).toBe(true);
  });

  it('rejects a size that is not offered', () => {
    expect(isSizeChoice(7)).toBe(false);
    expect(isSizeChoice(20)).toBe(false);
  });
});