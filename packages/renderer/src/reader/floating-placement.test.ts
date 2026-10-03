import { describe, expect, it } from 'vitest';
import { placeNearSelection } from './floating-placement';

const viewport = { width: 800, height: 600 };
const toolbar = { width: 100, height: 40 };

describe('placeNearSelection', () => {
  it('opens below the selection, aligned with its left edge, when there is room', () => {
    const anchor = { left: 200, top: 100, bottom: 120 };
    expect(placeNearSelection(anchor, toolbar, viewport)).toEqual({ left: 200, top: 128 });
  });

  it('flips above a selection on the bottom line', () => {
    const anchor = { left: 200, top: 540, bottom: 560 };
    expect(placeNearSelection(anchor, toolbar, viewport)).toEqual({ left: 200, top: 492 });
  });

  it('keeps the whole element inside the window at the right edge', () => {
    const anchor = { left: 760, top: 100, bottom: 120 };
    expect(placeNearSelection(anchor, toolbar, viewport).left).toBe(692);
  });

  it('keeps a margin from the left edge', () => {
    const anchor = { left: 0, top: 100, bottom: 120 };
    expect(placeNearSelection(anchor, toolbar, viewport).left).toBe(8);
  });

  it('flips above once a taller element no longer fits below', () => {
    const anchor = { left: 200, top: 480, bottom: 500 };
    expect(placeNearSelection(anchor, toolbar, viewport).top).toBe(508);
    expect(placeNearSelection(anchor, { width: 100, height: 90 }, viewport).top).toBe(382);
  });

  it('pins to the top margin when there is room neither below nor above', () => {
    const anchor = { left: 200, top: 20, bottom: 580 };
    expect(placeNearSelection(anchor, toolbar, viewport).top).toBe(8);
  });

  it('stays inside the window when the selection lies below its bottom edge', () => {
    const anchor = { left: 200, top: 700, bottom: 720 };
    expect(placeNearSelection(anchor, toolbar, viewport).top).toBe(552);
  });
});
