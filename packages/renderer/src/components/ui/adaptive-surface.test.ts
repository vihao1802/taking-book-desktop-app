import { describe, expect, it } from 'vitest';
import { getDialogPositionClasses, isBottomSheetClass } from './adaptive-surface';

describe('isBottomSheetClass', () => {
  it('is a bottom sheet at compact only', () => {
    expect(isBottomSheetClass('compact')).toBe(true);
    expect(isBottomSheetClass('medium')).toBe(false);
    expect(isBottomSheetClass('expanded')).toBe(false);
  });
});

describe('getDialogPositionClasses', () => {
  it('pins the dialog to the bottom edge at compact', () => {
    const classes = getDialogPositionClasses('compact');
    expect(classes).toContain('bottom-0');
    expect(classes).toContain('rounded-t-2xl');
    expect(classes).not.toContain('top-[50%]');
  });

  it.each(['medium', 'expanded'] as const)('centres the dialog at %s', (sizeClass) => {
    const classes = getDialogPositionClasses(sizeClass);
    expect(classes).toContain('top-[50%]');
    expect(classes).not.toContain('bottom-0');
  });
});
