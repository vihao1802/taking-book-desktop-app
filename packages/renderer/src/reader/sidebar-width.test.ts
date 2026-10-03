import { describe, expect, it } from 'vitest';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  getNotesPageInset,
  getThumbnailWidth,
} from './sidebar-width';

describe('clampSidebarWidth', () => {
  it('keeps widths inside the range unchanged', () => {
    expect(clampSidebarWidth(300)).toBe(300);
  });

  it('raises too-small widths to the minimum', () => {
    expect(clampSidebarWidth(0)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(-50)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it('lowers too-large widths to the maximum', () => {
    expect(clampSidebarWidth(5000)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it('rounds to whole pixels', () => {
    expect(clampSidebarWidth(300.6)).toBe(301);
  });
});

describe('getThumbnailWidth', () => {
  it('matches the original thumbnail size at the minimum sidebar width', () => {
    expect(getThumbnailWidth(SIDEBAR_MIN_WIDTH)).toBe(148);
  });

  it('grows one-to-one with the sidebar', () => {
    expect(getThumbnailWidth(SIDEBAR_MIN_WIDTH + 100)).toBe(248);
  });
});

describe('getNotesPageInset', () => {
  it('reserves nothing while the Notes sidebar is closed', () => {
    expect(getNotesPageInset(false, 320)).toBe(0);
  });

  it('reserves the sidebar width plus its margin and gap while open', () => {
    expect(getNotesPageInset(true, 320)).toBe(336);
  });

  it('follows the sidebar as it is resized', () => {
    expect(getNotesPageInset(true, 400) - getNotesPageInset(true, 300)).toBe(100);
  });
});
