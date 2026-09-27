import { describe, expect, it } from 'vitest';
import { DEFAULT_QUIZ_SCOPE_PAGES } from '@taking-book/core';
import { defaultScopeChoice, widenScopeChoice } from './quizScopeChoice';

describe('defaultScopeChoice', () => {
  it('reaches back DEFAULT_QUIZ_SCOPE_PAGES pages from the Last-read position', () => {
    expect(defaultScopeChoice(50)).toEqual({
      startPage: 50 - DEFAULT_QUIZ_SCOPE_PAGES + 1,
      endPage: 50,
      isDefault: true,
    });
  });

  it('clamps to page 1 for a book read only a few pages in', () => {
    expect(defaultScopeChoice(3)).toEqual({ startPage: 1, endPage: 3, isDefault: true });
  });
});

describe('widenScopeChoice', () => {
  it('widens to an earlier start page', () => {
    expect(widenScopeChoice(50, 5)).toEqual({ startPage: 5, endPage: 50, isDefault: false });
  });

  it('never widens past page 1', () => {
    expect(widenScopeChoice(50, -3)).toEqual({ startPage: 1, endPage: 50, isDefault: false });
  });

  it('clamps a request later than the default start back to the default', () => {
    const choice = widenScopeChoice(50, 49);
    expect(choice.startPage).toBe(defaultScopeChoiceStart(50));
    expect(choice.isDefault).toBe(true);
  });
});

function defaultScopeChoiceStart(lastPage: number): number {
  return Math.max(1, lastPage - DEFAULT_QUIZ_SCOPE_PAGES + 1);
}
