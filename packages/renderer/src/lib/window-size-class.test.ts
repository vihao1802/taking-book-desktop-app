import { describe, expect, it } from 'vitest';
import { classifyWindowWidth } from './window-size-class';

describe('classifyWindowWidth', () => {
  it.each([
    [0, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [839, 'medium'],
    [840, 'expanded'],
    [1920, 'expanded'],
  ] as const)('classifies %i dp as %s', (width, expected) => {
    expect(classifyWindowWidth(width)).toBe(expected);
  });
});
