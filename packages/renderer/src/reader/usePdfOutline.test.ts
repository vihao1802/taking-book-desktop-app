import { describe, expect, it } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { resolveOutlinePage } from './usePdfOutline';

type StubPdf = Pick<PDFDocumentProxy, 'getDestination' | 'getPageIndex'>;

function stubPdf({
  destinations = {},
  pageIndex = 0,
  failPageIndex = false,
}: {
  destinations?: Record<string, Array<unknown> | null>;
  pageIndex?: number;
  failPageIndex?: boolean;
} = {}): StubPdf {
  return {
    getDestination: async (id: string) => destinations[id] ?? null,
    getPageIndex: async () => {
      if (failPageIndex) throw new Error('no page');
      return pageIndex;
    },
  } as StubPdf;
}

describe('resolveOutlinePage', () => {
  it('resolves a page-reference destination via getPageIndex', async () => {
    const pdf = stubPdf({ pageIndex: 5 });
    await expect(resolveOutlinePage(pdf, [{ num: 3, gen: 0 }, { name: 'XYZ' }])).resolves.toBe(6);
  });

  it('resolves a 0-based integer page destination directly', async () => {
    const pdf = stubPdf();
    await expect(resolveOutlinePage(pdf, [0, { name: 'XYZ' }])).resolves.toBe(1);
    await expect(resolveOutlinePage(pdf, [99, { name: 'Fit' }])).resolves.toBe(100);
  });

  it('rejects negative and non-integer page numbers', async () => {
    const pdf = stubPdf();
    await expect(resolveOutlinePage(pdf, [-1, { name: 'XYZ' }])).resolves.toBeNull();
    await expect(resolveOutlinePage(pdf, [1.5, { name: 'XYZ' }])).resolves.toBeNull();
  });

  it('resolves a named destination through getDestination', async () => {
    const pdf = stubPdf({ destinations: { chapter1: [{ num: 7, gen: 0 }, { name: 'XYZ' }] }, pageIndex: 10 });
    await expect(resolveOutlinePage(pdf, 'chapter1')).resolves.toBe(11);
  });

  it('returns null for unknown named destinations', async () => {
    const pdf = stubPdf({ destinations: {} });
    await expect(resolveOutlinePage(pdf, 'missing')).resolves.toBeNull();
  });

  it('returns null for missing or malformed destinations', async () => {
    const pdf = stubPdf();
    await expect(resolveOutlinePage(pdf, null)).resolves.toBeNull();
    await expect(resolveOutlinePage(pdf, undefined)).resolves.toBeNull();
    await expect(resolveOutlinePage(pdf, [])).resolves.toBeNull();
    await expect(resolveOutlinePage(pdf, [null])).resolves.toBeNull();
    await expect(resolveOutlinePage(pdf, 'not-an-id')).resolves.toBeNull();
  });

  it('returns null when getPageIndex fails instead of throwing', async () => {
    const pdf = stubPdf({ failPageIndex: true });
    await expect(resolveOutlinePage(pdf, [{ num: 3, gen: 0 }])).resolves.toBeNull();
  });
});
