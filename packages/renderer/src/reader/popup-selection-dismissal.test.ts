import { describe, expect, it } from 'vitest';
import { shouldCloseOnSelectionChange, type SelectionEnds } from './popup-selection-dismissal';

const word = { name: 'word' };
const nextWord = { name: 'next word' };

const opened: SelectionEnds<object> = { anchorNode: word, anchorOffset: 0, focusNode: word, focusOffset: 4 };

describe('shouldCloseOnSelectionChange', () => {
  it('keeps the popup open when the selection is the one it opened for', () => {
    expect(shouldCloseOnSelectionChange({ opened, current: { ...opened }, insidePopup: false })).toBe(false);
  });

  it('closes the popup when the selection is extended with the keyboard', () => {
    const current = { ...opened, focusOffset: 5 };
    expect(shouldCloseOnSelectionChange({ opened, current, insidePopup: false })).toBe(true);
  });

  it('closes the popup when the selection moves to another node', () => {
    const current = { ...opened, focusNode: nextWord, focusOffset: 2 };
    expect(shouldCloseOnSelectionChange({ opened, current, insidePopup: false })).toBe(true);
  });

  it('closes the popup when the selection start moves', () => {
    const current = { ...opened, anchorOffset: 1 };
    expect(shouldCloseOnSelectionChange({ opened, current, insidePopup: false })).toBe(true);
  });

  it('closes the popup when the selection is cleared', () => {
    const current = { anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0 };
    expect(shouldCloseOnSelectionChange({ opened, current, insidePopup: false })).toBe(true);
  });

  it('keeps the popup open when the reader selects the Translation text inside it', () => {
    const current = { anchorNode: nextWord, anchorOffset: 0, focusNode: nextWord, focusOffset: 3 };
    expect(shouldCloseOnSelectionChange({ opened, current, insidePopup: true })).toBe(false);
  });
});
