import { describe, expect, it } from 'vitest';
import { TAP_SLOP_DP, isTapMovement, shouldToggleOverlay } from './overlay-tap';

describe('isTapMovement', () => {
  it('counts a press that stayed put as a tap', () => {
    expect(isTapMovement({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
  });

  it('allows a little finger wobble', () => {
    expect(isTapMovement({ x: 100, y: 100 }, { x: 100 + TAP_SLOP_DP - 1, y: 100 })).toBe(true);
  });

  it('counts a scroll or drag as not a tap, in any direction', () => {
    expect(isTapMovement({ x: 100, y: 100 }, { x: 100, y: 100 + TAP_SLOP_DP + 1 })).toBe(false);
    expect(isTapMovement({ x: 100, y: 100 }, { x: 100 - TAP_SLOP_DP - 1, y: 100 })).toBe(false);
  });
});

describe('shouldToggleOverlay', () => {
  const still = { moved: false, selectionBefore: false, selectionNow: false };

  it('toggles on a tap with no selection involved', () => {
    expect(shouldToggleOverlay(still)).toBe(true);
  });

  it('does not toggle when the press moved, as in a scroll', () => {
    expect(shouldToggleOverlay({ ...still, moved: true })).toBe(false);
  });

  it('does not toggle on the tap that clears a selection', () => {
    expect(shouldToggleOverlay({ ...still, selectionBefore: true })).toBe(false);
  });

  it('does not toggle on the gesture that makes a selection', () => {
    expect(shouldToggleOverlay({ ...still, selectionNow: true })).toBe(false);
  });
});
