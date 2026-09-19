import { describe, expect, it } from 'vitest';
import {
  ZOOM_PRESETS,
  clampZoomPercent,
  multiplierToPercent,
  nextPresetPercent,
  parseCustomZoomPercent,
  percentToMultiplier,
  previousPresetPercent,
  stepZoomMultiplier,
} from '../src/zoom';

describe('ZOOM_PRESETS', () => {
  it('exposes the canonical preset list in ascending order', () => {
    expect(ZOOM_PRESETS).toEqual([50, 75, 100, 125, 150, 175, 200]);
  });
});

describe('multiplierToPercent', () => {
  it('converts a multiplier to a whole percentage', () => {
    expect(multiplierToPercent(1)).toBe(100);
    expect(multiplierToPercent(1.25)).toBe(125);
    expect(multiplierToPercent(1.3)).toBe(130);
    expect(multiplierToPercent(0.5)).toBe(50);
  });
});

describe('percentToMultiplier', () => {
  it('converts a percentage back to its multiplier', () => {
    expect(percentToMultiplier(100)).toBe(1);
    expect(percentToMultiplier(125)).toBe(1.25);
    expect(percentToMultiplier(50)).toBe(0.5);
  });
});

describe('clampZoomPercent', () => {
  it('clamps values above the max to 200', () => {
    expect(clampZoomPercent(250)).toBe(200);
    expect(clampZoomPercent(200)).toBe(200);
  });

  it('clamps values below the min to 50', () => {
    expect(clampZoomPercent(30)).toBe(50);
    expect(clampZoomPercent(50)).toBe(50);
  });

  it('keeps values inside the range unchanged', () => {
    expect(clampZoomPercent(137)).toBe(137);
  });
});

describe('nextPresetPercent', () => {
  it('returns the next preset strictly above a non-preset value', () => {
    expect(nextPresetPercent(120)).toBe(125);
    expect(nextPresetPercent(130)).toBe(150);
    expect(nextPresetPercent(1)).toBe(50);
  });

  it('returns the next preset strictly above an exact preset', () => {
    expect(nextPresetPercent(125)).toBe(150);
    expect(nextPresetPercent(50)).toBe(75);
  });

  it('returns null at the max bound', () => {
    expect(nextPresetPercent(200)).toBeNull();
    expect(nextPresetPercent(250)).toBeNull();
  });
});

describe('previousPresetPercent', () => {
  it('returns the previous preset strictly below a non-preset value', () => {
    expect(previousPresetPercent(120)).toBe(100);
    expect(previousPresetPercent(130)).toBe(125);
  });

  it('returns the previous preset strictly below an exact preset', () => {
    expect(previousPresetPercent(125)).toBe(100);
    expect(previousPresetPercent(200)).toBe(175);
  });

  it('returns null at the min bound', () => {
    expect(previousPresetPercent(50)).toBeNull();
    expect(previousPresetPercent(30)).toBeNull();
  });
});

describe('parseCustomZoomPercent', () => {
  it('accepts a whole percentage inside the range', () => {
    expect(parseCustomZoomPercent('137')).toBe(137);
    expect(parseCustomZoomPercent('50')).toBe(50);
    expect(parseCustomZoomPercent('200')).toBe(200);
  });

  it('trims surrounding whitespace', () => {
    expect(parseCustomZoomPercent(' 125 ')).toBe(125);
  });

  it('rejects empty input', () => {
    expect(parseCustomZoomPercent('')).toBeNull();
    expect(parseCustomZoomPercent('   ')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseCustomZoomPercent('abc')).toBeNull();
    expect(parseCustomZoomPercent('12%')).toBeNull();
  });

  it('rejects decimals', () => {
    expect(parseCustomZoomPercent('137.5')).toBeNull();
  });

  it('rejects values outside the range', () => {
    expect(parseCustomZoomPercent('49')).toBeNull();
    expect(parseCustomZoomPercent('201')).toBeNull();
    expect(parseCustomZoomPercent('-10')).toBeNull();
  });
});

describe('stepZoomMultiplier', () => {
  it('steps to the next preset above and below', () => {
    expect(stepZoomMultiplier(1, 'in')).toBe(1.25);
    expect(stepZoomMultiplier(1, 'out')).toBe(0.75);
  });

  it('snaps a custom zoom to the nearest preset in the requested direction', () => {
    expect(stepZoomMultiplier(1.1, 'in')).toBe(1.25);
    expect(stepZoomMultiplier(1.1, 'out')).toBe(1);
  });

  it('returns null at the limits', () => {
    expect(stepZoomMultiplier(2, 'in')).toBeNull();
    expect(stepZoomMultiplier(0.5, 'out')).toBeNull();
  });
});
