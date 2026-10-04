import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUri = vi.fn();

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: { getUri },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (uri: string) => `https://localhost/_capacitor_file_${uri.slice('file://'.length)}` },
}));

const { createDocumentUrlResolver } = await import('./capacitor-book-storage');

describe('createDocumentUrlResolver', () => {
  beforeEach(() => getUri.mockReset());

  it.each([
    ['without a trailing slash', 'file:///data/user/0/dev.takingbook.app/files/books'],
    ['with a trailing slash, as Android reports a folder', 'file:///data/user/0/dev.takingbook.app/files/books/'],
  ])('builds a WebView URL for a stored book when the folder URI comes %s', async (_label, uri) => {
    getUri.mockResolvedValue({ uri });
    const resolver = await createDocumentUrlResolver();
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    expect(resolver.data('books/abc.pdf')).toBe(
      'https://localhost/_capacitor_file_/data/user/0/dev.takingbook.app/files/books/abc.pdf',
    );
  });

  it('refuses a data folder that is not the books folder', async () => {
    getUri.mockResolvedValue({ uri: 'file:///data/user/0/dev.takingbook.app/files/elsewhere/' });
    const resolver = await createDocumentUrlResolver();
    expect(resolver).toEqual({ ok: false, error: expect.stringContaining('Unexpected app data location') });
  });
});
