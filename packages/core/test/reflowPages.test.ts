import { describe, expect, it } from 'vitest';
import { PAGE_PROBE_PX, offsetForPageLocation, pageIndexAtOffset, pageIndexAtScroll, pageLocationAtOffset } from '../src';

// Three pages: [0, 100), [100, 150), [150, 400).
const OFFSETS = [0, 100, 150];
const TOTAL = 400;

describe('pageIndexAtOffset', () => {
  it('returns the page whose span contains the offset', () => {
    expect(pageIndexAtOffset(OFFSETS, 0)).toBe(0);
    expect(pageIndexAtOffset(OFFSETS, 99)).toBe(0);
    expect(pageIndexAtOffset(OFFSETS, 100)).toBe(1);
    expect(pageIndexAtOffset(OFFSETS, 149)).toBe(1);
    expect(pageIndexAtOffset(OFFSETS, 150)).toBe(2);
  });

  it('clamps offsets above the first page and below the end', () => {
    expect(pageIndexAtOffset(OFFSETS, -50)).toBe(0);
    expect(pageIndexAtOffset(OFFSETS, 10_000)).toBe(2);
  });

  it('returns 0 when there are no pages', () => {
    expect(pageIndexAtOffset([], 40)).toBe(0);
  });
});

describe('pageLocationAtOffset', () => {
  it('reports the page and the fraction down it', () => {
    expect(pageLocationAtOffset(OFFSETS, TOTAL, 125)).toEqual({ page: 2, fraction: 0.5 });
    expect(pageLocationAtOffset(OFFSETS, TOTAL, 100)).toEqual({ page: 2, fraction: 0 });
  });

  it('uses the total height as the last page bottom', () => {
    expect(pageLocationAtOffset(OFFSETS, TOTAL, 275)).toEqual({ page: 3, fraction: 0.5 });
  });

  it('clamps the fraction past the end of the content', () => {
    expect(pageLocationAtOffset(OFFSETS, TOTAL, 900)).toEqual({ page: 3, fraction: 1 });
    expect(pageLocationAtOffset(OFFSETS, TOTAL, -10)).toEqual({ page: 1, fraction: 0 });
  });

  it('gives a zero-height page a fraction of 0', () => {
    // Page 2 has no height (two pages share a top offset); the later page wins.
    expect(pageLocationAtOffset([0, 100, 100], 200, 100)).toEqual({ page: 3, fraction: 0 });
  });

  it('returns page 1 at the top when there are no pages', () => {
    expect(pageLocationAtOffset([], 0, 30)).toEqual({ page: 1, fraction: 0 });
  });
});

describe('offsetForPageLocation', () => {
  it('converts a page location back to an offset', () => {
    expect(offsetForPageLocation(OFFSETS, TOTAL, { page: 2, fraction: 0.5 })).toBe(125);
    expect(offsetForPageLocation(OFFSETS, TOTAL, { page: 3, fraction: 1 })).toBe(400);
  });

  it('clamps pages and fractions to the document', () => {
    expect(offsetForPageLocation(OFFSETS, TOTAL, { page: 0, fraction: 0 })).toBe(0);
    expect(offsetForPageLocation(OFFSETS, TOTAL, { page: 99, fraction: 0 })).toBe(150);
    expect(offsetForPageLocation(OFFSETS, TOTAL, { page: 1, fraction: 5 })).toBe(100);
  });

  it('returns 0 when there are no pages', () => {
    expect(offsetForPageLocation([], 0, { page: 4, fraction: 0.3 })).toBe(0);
  });

  it('round-trips with pageLocationAtOffset', () => {
    for (const y of [0, 37, 100, 124, 150, 399]) {
      const location = pageLocationAtOffset(OFFSETS, TOTAL, y);
      expect(offsetForPageLocation(OFFSETS, TOTAL, location)).toBeCloseTo(y);
    }
  });
});

describe('pageIndexAtScroll', () => {
  // Fractional page tops, as a PDF layout produces them.
  const FRACTIONAL = [12, 1234.6, 2456.2];

  it('reads a page scrolled to as itself even when the browser rounded scrollTop just below its top', () => {
    // scrollTo({ top: 1234.6 }) can leave scrollTop at 1234 or 1234.5.
    expect(pageIndexAtOffset(FRACTIONAL, 1234)).toBe(0);
    expect(pageIndexAtScroll(FRACTIONAL, 1234)).toBe(1);
    expect(pageIndexAtScroll(FRACTIONAL, 1234.5)).toBe(1);
  });

  it('keeps the previous page while its bottom is still clearly in view', () => {
    expect(pageIndexAtScroll(FRACTIONAL, 1234.6 - PAGE_PROBE_PX - 1)).toBe(0);
  });

  it('reads the first page for offsets above it', () => {
    expect(pageIndexAtScroll(FRACTIONAL, 0)).toBe(0);
  });

  it('returns index 0 when there are no pages', () => {
    expect(pageIndexAtScroll([], 500)).toBe(0);
  });
});
