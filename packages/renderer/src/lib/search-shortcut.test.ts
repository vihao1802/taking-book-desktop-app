import { describe, expect, it } from 'vitest';
import { isSearchShortcut, type ShortcutKeys } from './search-shortcut';

function keys(overrides: Partial<ShortcutKeys>): ShortcutKeys {
  return { key: '', ctrlKey: false, metaKey: false, altKey: false, ...overrides };
}

describe('isSearchShortcut', () => {
  it('accepts Ctrl+F and Cmd+F in either case', () => {
    expect(isSearchShortcut(keys({ key: 'f', ctrlKey: true }))).toBe(true);
    expect(isSearchShortcut(keys({ key: 'f', metaKey: true }))).toBe(true);
    expect(isSearchShortcut(keys({ key: 'F', ctrlKey: true }))).toBe(true);
  });

  it('accepts a bare slash', () => {
    expect(isSearchShortcut(keys({ key: '/' }))).toBe(true);
  });

  it('rejects a slash with a modifier', () => {
    expect(isSearchShortcut(keys({ key: '/', ctrlKey: true }))).toBe(false);
    expect(isSearchShortcut(keys({ key: '/', altKey: true }))).toBe(false);
  });

  it('rejects F without Ctrl or Cmd, and the old Ctrl+K', () => {
    expect(isSearchShortcut(keys({ key: 'f' }))).toBe(false);
    expect(isSearchShortcut(keys({ key: 'k', ctrlKey: true }))).toBe(false);
  });
});
