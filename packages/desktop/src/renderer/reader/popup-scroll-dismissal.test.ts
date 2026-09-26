import { describe, expect, it } from 'vitest';
import { RESIZE_SETTLE_MS, createScrollDismissal } from './popup-scroll-dismissal';

describe('createScrollDismissal', () => {
  it('closes the popup when the reader view scrolls', () => {
    const dismissal = createScrollDismissal();
    expect(dismissal.shouldClose({ time: 1000, scroller: 'reader-view' })).toBe(true);
  });

  it('keeps the popup open when the popup itself scrolls', () => {
    const dismissal = createScrollDismissal();
    expect(dismissal.shouldClose({ time: 1000, scroller: 'popup' })).toBe(false);
  });

  it('keeps the popup open when a scroller outside the reader view scrolls, such as the Notes sidebar', () => {
    const dismissal = createScrollDismissal();
    expect(dismissal.shouldClose({ time: 1000, scroller: 'other' })).toBe(false);
  });

  it('keeps the popup open while the reader re-lays out after a window resize', () => {
    const dismissal = createScrollDismissal();
    dismissal.recordResize(1000);
    expect(dismissal.shouldClose({ time: 1100, scroller: 'reader-view' })).toBe(false);
  });

  it('closes the popup again once the reader has settled after a resize', () => {
    const dismissal = createScrollDismissal();
    dismissal.recordResize(1000);
    expect(dismissal.shouldClose({ time: 1000 + RESIZE_SETTLE_MS + 1, scroller: 'reader-view' })).toBe(true);
  });

  it('measures the settling time from the last resize of a window drag', () => {
    const dismissal = createScrollDismissal();
    dismissal.recordResize(1000);
    dismissal.recordResize(1000 + RESIZE_SETTLE_MS);
    expect(dismissal.shouldClose({ time: 1000 + RESIZE_SETTLE_MS + 1, scroller: 'reader-view' })).toBe(false);
  });
});
