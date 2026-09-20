import { describe, expect, it } from 'vitest';
import { resolveNoteDraftKey, type NoteDraftKeyEvent } from './note-draft-keys';

function press(key: string, overrides: Partial<NoteDraftKeyEvent> = {}): NoteDraftKeyEvent {
  return { key, metaKey: false, ctrlKey: false, isComposing: false, ...overrides };
}

describe('resolveNoteDraftKey', () => {
  it('saves on Ctrl+Enter and on Cmd+Enter', () => {
    expect(resolveNoteDraftKey(press('Enter', { ctrlKey: true }))).toBe('save');
    expect(resolveNoteDraftKey(press('Enter', { metaKey: true }))).toBe('save');
  });

  it('leaves a plain Enter alone so it inserts a new line', () => {
    expect(resolveNoteDraftKey(press('Enter'))).toBeNull();
  });

  it('cancels on Escape', () => {
    expect(resolveNoteDraftKey(press('Escape'))).toBe('cancel');
  });

  it('ignores every key while an input method is composing text', () => {
    expect(resolveNoteDraftKey(press('Enter', { ctrlKey: true, isComposing: true }))).toBeNull();
    expect(resolveNoteDraftKey(press('Escape', { isComposing: true }))).toBeNull();
  });

  it('ignores other keys, with or without a modifier', () => {
    expect(resolveNoteDraftKey(press('a'))).toBeNull();
    expect(resolveNoteDraftKey(press('s', { ctrlKey: true }))).toBeNull();
  });
});
