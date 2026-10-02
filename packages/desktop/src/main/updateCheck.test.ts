import { describe, expect, it, vi } from 'vitest';
import { isReleaseDownloadUrl } from './updateCheck';

vi.mock('electron', () => ({ app: {}, ipcMain: {}, net: {}, shell: {} }));

describe('isReleaseDownloadUrl', () => {
  it.each([
    'https://github.com/vihao1802/taking-book-desktop-app/releases/download/v1.3.0/taking-book-desktop_1.3.0_amd64.deb',
    'https://github.com/vihao1802/taking-book-desktop-app/releases/tag/v1.3.0',
  ])('allows %s', (url) => {
    expect(isReleaseDownloadUrl(url)).toBe(true);
  });

  it.each([
    'https://github.com/someone-else/taking-book-desktop-app/releases/download/v1/x.deb',
    'https://github.com/vihao1802/taking-book-releases/releases/download/v1/x.deb',
    'https://github.com.evil.test/vihao1802/taking-book-desktop-app/releases/x',
    'http://github.com/vihao1802/taking-book-desktop-app/releases/x',
    'https://github.com/vihao1802/taking-book-desktop-app/releases/../../other',
    'file:///etc/passwd',
    42,
  ])('refuses %s', (url) => {
    expect(isReleaseDownloadUrl(url)).toBe(false);
  });
});
