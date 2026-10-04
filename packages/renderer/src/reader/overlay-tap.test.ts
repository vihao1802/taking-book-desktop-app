import { describe, expect, it } from 'vitest';
import { isMiddleTap, shouldToggleOverlay } from './overlay-tap';

const area = { left: 0, top: 0, width: 1000, height: 600 };

describe('isMiddleTap', () => {
  it('accepts the centre of the reading area', () => {
    expect(isMiddleTap({ x: 500, y: 300 }, area)).toBe(true);
  });

  it('rejects the left and right edge strips', () => {
    expect(isMiddleTap({ x: 50, y: 300 }, area)).toBe(false);
    expect(isMiddleTap({ x: 950, y: 300 }, area)).toBe(false);
  });

  it('rejects the top and bottom edge strips, where the bars sit', () => {
    expect(isMiddleTap({ x: 500, y: 20 }, area)).toBe(false);
    expect(isMiddleTap({ x: 500, y: 580 }, area)).toBe(false);
  });

  it('measures from the area origin', () => {
    expect(isMiddleTap({ x: 1500, y: 800 }, { left: 1000, top: 500, width: 1000, height: 600 })).toBe(true);
  });
});

describe('shouldToggleOverlay', () => {
  it('toggles on a middle tap with no selection involved', () => {
    expect(shouldToggleOverlay({ middle: true, selectionBefore: false, selectionNow: false })).toBe(true);
  });

  it('does not toggle outside the middle', () => {
    expect(shouldToggleOverlay({ middle: false, selectionBefore: false, selectionNow: false })).toBe(false);
  });

  it('does not toggle on the tap that clears a selection', () => {
    expect(shouldToggleOverlay({ middle: true, selectionBefore: true, selectionNow: false })).toBe(false);
  });

  it('does not toggle on the gesture that makes a selection', () => {
    expect(shouldToggleOverlay({ middle: true, selectionBefore: false, selectionNow: true })).toBe(false);
  });
});
