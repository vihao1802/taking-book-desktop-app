import { describe, expect, it } from 'vitest';
import { createEntranceGate } from './entrance-gate';

describe('createEntranceGate', () => {
  it('lets the entrance play before it has been shown', () => {
    expect(createEntranceGate().shouldPlay()).toBe(true);
  });

  it('keeps letting it play until it is marked as shown', () => {
    const gate = createEntranceGate();
    gate.shouldPlay();
    expect(gate.shouldPlay()).toBe(true);
  });

  it('never lets it play again once shown', () => {
    const gate = createEntranceGate();
    gate.markShown();
    expect(gate.shouldPlay()).toBe(false);
    gate.markShown();
    expect(gate.shouldPlay()).toBe(false);
  });

  it('keeps each gate separate', () => {
    const shown = createEntranceGate();
    shown.markShown();
    expect(createEntranceGate().shouldPlay()).toBe(true);
  });
});
