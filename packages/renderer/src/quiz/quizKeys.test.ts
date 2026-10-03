import { describe, expect, it } from 'vitest';
import { resolveQuizKey } from './quizKeys';

describe('resolveQuizKey', () => {
  it('selects the option a digit key names, numbered from 1', () => {
    expect(resolveQuizKey({ key: '1', revealed: false, selected: null, optionCount: 4 })).toEqual({
      type: 'selectOption',
      index: 0,
    });
    expect(resolveQuizKey({ key: '4', revealed: false, selected: null, optionCount: 4 })).toEqual({
      type: 'selectOption',
      index: 3,
    });
  });

  it('selects a new option, replacing the previous selection', () => {
    expect(resolveQuizKey({ key: '2', revealed: false, selected: 0, optionCount: 4 })).toEqual({
      type: 'selectOption',
      index: 1,
    });
  });

  it('ignores a digit beyond the question’s options', () => {
    expect(resolveQuizKey({ key: '5', revealed: false, selected: null, optionCount: 4 })).toBeNull();
    expect(resolveQuizKey({ key: '0', revealed: false, selected: null, optionCount: 4 })).toBeNull();
  });

  it('ignores a key that is not a digit or Enter', () => {
    expect(resolveQuizKey({ key: 'a', revealed: false, selected: null, optionCount: 4 })).toBeNull();
    expect(resolveQuizKey({ key: ' ', revealed: false, selected: null, optionCount: 4 })).toBeNull();
  });

  it('reveals with Enter only once an option is selected', () => {
    expect(resolveQuizKey({ key: 'Enter', revealed: false, selected: 1, optionCount: 4 })).toEqual({ type: 'reveal' });
    expect(resolveQuizKey({ key: 'Enter', revealed: false, selected: null, optionCount: 4 })).toBeNull();
  });

  it('advances to the next question with Enter once the answer is revealed', () => {
    expect(resolveQuizKey({ key: 'Enter', revealed: true, selected: 0, optionCount: 4 })).toEqual({ type: 'next' });
    expect(resolveQuizKey({ key: 'Enter', revealed: true, selected: null, optionCount: 4 })).toEqual({ type: 'next' });
  });

  it('ignores digit keys once the answer is revealed', () => {
    expect(resolveQuizKey({ key: '2', revealed: true, selected: 0, optionCount: 4 })).toBeNull();
  });
});