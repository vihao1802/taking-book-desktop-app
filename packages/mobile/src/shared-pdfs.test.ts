import { describe, expect, it } from 'vitest';
import { sortSharedFiles } from './shared-pdfs';

const toWebUrl = (uri: string): string => `web:${uri}`;

describe('sortSharedFiles', () => {
  it('accepts a PDF by its declared type and turns its URI into a web URL', () => {
    const sorted = sortSharedFiles([{ uri: 'content://a/1', name: 'Dune.pdf', mimeType: 'application/pdf' }], toWebUrl);
    expect(sorted).toEqual({ pdfs: [{ name: 'Dune.pdf', webPath: 'web:content://a/1' }], rejected: [] });
  });

  it('adds the extension to a PDF that was shared without one', () => {
    const sorted = sortSharedFiles([{ uri: 'content://a/2', name: 'Statement', mimeType: 'application/pdf' }], toWebUrl);
    expect(sorted.pdfs[0].name).toBe('Statement.pdf');
  });

  it('trusts the file name when the sender declared no specific type', () => {
    const sorted = sortSharedFiles(
      [
        { uri: 'content://a/3', name: 'Paper.PDF', mimeType: null },
        { uri: 'content://a/4', name: 'Scan.pdf', mimeType: 'application/octet-stream' },
      ],
      toWebUrl,
    );
    expect(sorted.pdfs.map((pdf) => pdf.name)).toEqual(['Paper.PDF', 'Scan.pdf']);
  });

  it('rejects files that are not PDFs, even one named .pdf under another declared type', () => {
    const sorted = sortSharedFiles(
      [
        { uri: 'content://a/5', name: 'photo.jpg', mimeType: 'image/jpeg' },
        { uri: 'content://a/6', name: 'fake.pdf', mimeType: 'text/plain' },
        { uri: 'content://a/7', name: 'notes', mimeType: null },
      ],
      toWebUrl,
    );
    expect(sorted).toEqual({ pdfs: [], rejected: ['photo.jpg', 'fake.pdf', 'notes'] });
  });
});
