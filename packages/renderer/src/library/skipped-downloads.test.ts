import { describe, expect, it } from 'vitest';
import type { SkippedDownload } from '@taking-book/core';
import { describeSkippedDownloads } from './skipped-downloads';

const skip = (reason: SkippedDownload['reason'], title: string, message: string): SkippedDownload => ({ hash: title, title, reason, message });

describe('describeSkippedDownloads', () => {
  it('says nothing when nothing was skipped', () => {
    expect(describeSkippedDownloads([])).toEqual([]);
  });

  it('says a network or storage reason once with a count', () => {
    const messages = describeSkippedDownloads([skip('network', 'A', 'Use Wi-Fi.'), skip('network', 'B', 'Use Wi-Fi.'), skip('storage', 'C', 'Storage is low.')]);

    expect(messages).toEqual(['1 PDF not downloaded. Storage is low.', '2 PDFs not downloaded. Use Wi-Fi.']);
  });

  it('names each oversize Book', () => {
    expect(describeSkippedDownloads([skip('size', 'Atlas', 'Read it on desktop.')])).toEqual(['Atlas: Read it on desktop.']);
  });
});
