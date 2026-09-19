import { describe, expect, it } from 'vitest';
import {
  detectShortcutPlatform,
  formatShortcutLabel,
  resolveReaderShortcut,
  type KeyInput,
  type ShortcutPlatform,
} from '../src/readerShortcuts';

function key(name: string, modifiers: Partial<KeyInput> = {}): KeyInput {
  return {
    key: name,
    code: `Key${name.toUpperCase()}`,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

function resolve(input: KeyInput, platform: ShortcutPlatform = 'other', isTyping = false) {
  return resolveReaderShortcut(input, { platform, isTyping });
}

describe('detectShortcutPlatform', () => {
  it('recognizes Apple platforms', () => {
    expect(detectShortcutPlatform('MacIntel')).toBe('mac');
    expect(detectShortcutPlatform('iPad')).toBe('mac');
  });

  it('treats everything else as other', () => {
    expect(detectShortcutPlatform('Win32')).toBe('other');
    expect(detectShortcutPlatform('Linux x86_64')).toBe('other');
    expect(detectShortcutPlatform('')).toBe('other');
  });
});

describe('primary modifier', () => {
  it('uses Ctrl on Windows and Linux', () => {
    expect(resolve(key('f', { ctrlKey: true }), 'other')).toBe('find');
    expect(resolve(key('f', { metaKey: true }), 'other')).toBeNull();
  });

  it('uses Cmd on macOS and leaves Ctrl alone', () => {
    expect(resolve(key('f', { metaKey: true }), 'mac')).toBe('find');
    expect(resolve(key('f', { ctrlKey: true }), 'mac')).toBeNull();
  });

  it('is case-insensitive so Caps Lock does not break it', () => {
    expect(resolve(key('F', { ctrlKey: true }))).toBe('find');
  });

  it('rejects Cmd+Shift+F, which is not find', () => {
    expect(resolve(key('f', { metaKey: true, shiftKey: true }), 'mac')).toBeNull();
  });
});

describe('find navigation', () => {
  it('maps F3 and Shift+F3 on every platform', () => {
    expect(resolve(key('F3'), 'other')).toBe('findNext');
    expect(resolve(key('F3', { shiftKey: true }), 'mac')).toBe('findPrevious');
  });

  it('maps Primary+G and Primary+Shift+G', () => {
    expect(resolve(key('g', { metaKey: true }), 'mac')).toBe('findNext');
    expect(resolve(key('g', { ctrlKey: true, shiftKey: true }), 'other')).toBe('findPrevious');
  });
});

describe('go to page', () => {
  it('uses the physical G key so macOS Option+G ("©") still matches', () => {
    const input: KeyInput = { key: '©', code: 'KeyG', ctrlKey: false, metaKey: true, shiftKey: false, altKey: true };
    expect(resolve(input, 'mac')).toBe('goToPage');
  });

  it('works with Ctrl+Alt+G elsewhere', () => {
    expect(resolve(key('g', { ctrlKey: true, altKey: true }))).toBe('goToPage');
  });

  it('ignores other Alt combinations', () => {
    expect(resolve(key('f', { ctrlKey: true, altKey: true }))).toBeNull();
  });
});

describe('zoom', () => {
  it('maps = and + to zoom in (Shift is needed for + on US layouts)', () => {
    expect(resolve(key('=', { ctrlKey: true }))).toBe('zoomIn');
    expect(resolve(key('+', { ctrlKey: true, shiftKey: true }))).toBe('zoomIn');
  });

  it('maps - and _ to zoom out and 0 to fit width', () => {
    expect(resolve(key('-', { metaKey: true }), 'mac')).toBe('zoomOut');
    expect(resolve(key('_', { metaKey: true, shiftKey: true }), 'mac')).toBe('zoomOut');
    expect(resolve(key('0', { ctrlKey: true }))).toBe('zoomFit');
  });

  it('ignores plain = - 0', () => {
    expect(resolve(key('='))).toBeNull();
    expect(resolve(key('-'))).toBeNull();
    expect(resolve(key('0'))).toBeNull();
  });
});

describe('single keys', () => {
  it('maps navigation keys', () => {
    expect(resolve(key('Home'))).toBe('firstPage');
    expect(resolve(key('End'))).toBe('lastPage');
    expect(resolve(key('PageDown'))).toBe('nextScreen');
    expect(resolve(key('PageUp'))).toBe('previousScreen');
    expect(resolve(key('ArrowRight'))).toBe('nextPage');
    expect(resolve(key('ArrowLeft'))).toBe('previousPage');
    expect(resolve(key('ArrowDown'))).toBe('lineDown');
    expect(resolve(key('ArrowUp'))).toBe('lineUp');
  });

  it('maps Space and Shift+Space to next and previous screen', () => {
    expect(resolve(key(' '))).toBe('nextScreen');
    expect(resolve(key(' ', { shiftKey: true }))).toBe('previousScreen');
  });

  it('maps t, o and r, including with Caps Lock on', () => {
    expect(resolve(key('t'))).toBe('toggleThumbnails');
    expect(resolve(key('O'))).toBe('toggleOutline');
    expect(resolve(key('r'))).toBe('toggleReflow');
  });

  it('does not treat modified arrows or letters as reader keys', () => {
    expect(resolve(key('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(resolve(key('ArrowLeft', { altKey: true }))).toBeNull();
    expect(resolve(key('ArrowLeft', { shiftKey: true }))).toBeNull();
    expect(resolve(key('r', { ctrlKey: true }))).toBeNull();
    expect(resolve(key('r', { metaKey: true }), 'mac')).toBeNull();
    expect(resolve(key('t', { shiftKey: true }))).toBeNull();
  });

  it('does not treat Ctrl+Space or Alt+Space as paging', () => {
    expect(resolve(key(' ', { ctrlKey: true }))).toBeNull();
    expect(resolve(key(' ', { altKey: true }))).toBeNull();
  });
});

describe('typing guard', () => {
  it('lets plain keys through to text fields', () => {
    for (const name of ['r', 't', 'o', ' ', 'Home', 'ArrowLeft', 'PageDown']) {
      expect(resolve(key(name), 'other', true)).toBeNull();
    }
  });

  it('still resolves Escape and modifier shortcuts while typing', () => {
    expect(resolve(key('Escape'), 'other', true)).toBe('dismiss');
    expect(resolve(key('f', { ctrlKey: true }), 'other', true)).toBe('find');
    expect(resolve(key('F3'), 'other', true)).toBe('findNext');
  });
});

describe('Escape', () => {
  it('dismisses only when no modifier is held', () => {
    expect(resolve(key('Escape'))).toBe('dismiss');
    expect(resolve(key('Escape', { ctrlKey: true }))).toBeNull();
  });
});

describe('formatShortcutLabel', () => {
  it('uses Apple notation on macOS and Ctrl notation elsewhere', () => {
    expect(formatShortcutLabel('find', 'mac')).toBe('⌘F');
    expect(formatShortcutLabel('find', 'other')).toBe('Ctrl+F');
    expect(formatShortcutLabel('zoomFit', 'mac')).toBe('⌘0');
    expect(formatShortcutLabel('goToPage', 'other')).toBe('Ctrl+Alt+G');
  });

  it('returns null for actions that are not advertised', () => {
    expect(formatShortcutLabel('lineDown', 'other')).toBeNull();
  });
});
