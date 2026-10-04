import { describe, expect, it } from 'vitest';
import { MAX_PAGE_WIDTH_DP, getPageBaseWidth } from './page-width';

describe('getPageBaseWidth', () => {
  it('fills the available width at compact and medium', () => {
    expect(getPageBaseWidth(400, 'compact')).toBe(400);
    expect(getPageBaseWidth(800, 'medium')).toBe(800);
  });

  it('fills the available width at expanded while it is under the maximum', () => {
    expect(getPageBaseWidth(MAX_PAGE_WIDTH_DP - 1, 'expanded')).toBe(MAX_PAGE_WIDTH_DP - 1);
  });

  it('stops at the maximum reading width at expanded', () => {
    expect(getPageBaseWidth(1600, 'expanded')).toBe(MAX_PAGE_WIDTH_DP);
  });
});
