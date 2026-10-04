import { describe, expect, it, vi } from 'vitest';
import { err, ok, type LibraryService } from '@taking-book/core';
import { createBookFiles, type BookFilesOptions } from './book-files';

function createOptions(overrides: Partial<BookFilesOptions>): BookFilesOptions {
  const importBooks = vi.fn(async () => ok({ added: [], alreadyInLibrary: [], skipped: [] }));
  return {
    library: { importBooks } as unknown as LibraryService,
    pickPdfs: async () => ok([{ name: 'Dune.pdf', webPath: 'content://docs/1' }]),
    shares: { takePending: async () => ok([]), onReceived: () => () => undefined },
    storage: { create: vi.fn(), append: vi.fn(), commit: vi.fn(), discard: vi.fn() },
    openStream: async () => new ReadableStream<Uint8Array>(),
    generateId: () => 'run',
    checkReadable: async () => ok(undefined),
    getDocumentUrl: (path) => path,
    log: () => undefined,
    ...overrides,
  };
}

describe('createBookFiles', () => {
  it('returns null and imports nothing when the picker is closed without a choice', async () => {
    const options = createOptions({ pickPdfs: async () => ok(null) });
    const files = createBookFiles(options);
    expect(await files.addFromPicker(() => undefined)).toEqual({ ok: true, data: null });
    expect(options.library.importBooks).not.toHaveBeenCalled();
  });

  it('passes a picker failure on to the reader', async () => {
    const files = createBookFiles(createOptions({ pickPdfs: async () => err('The file picker could not be opened.') }));
    expect(await files.addFromPicker(() => undefined)).toEqual({ ok: false, error: 'The file picker could not be opened.' });
  });

  it('logs the cause of a failed import and shows the reader a plain message', async () => {
    const log = vi.fn();
    const library = { importBooks: async () => err('database is locked') } as unknown as LibraryService;
    const files = createBookFiles(createOptions({ library, log }));
    expect(await files.addFromPicker(() => undefined)).toEqual({ ok: false, error: 'The books could not be added to the Library.' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('database is locked'));
  });
});

describe('createBookFiles addFromShares', () => {
  const pdf = { uri: 'content://docs/1', name: 'Dune.pdf', mimeType: 'application/pdf' };
  const photo = { uri: 'content://docs/2', name: 'cat.jpg', mimeType: 'image/jpeg' };

  it('returns null and imports nothing when nothing was shared', async () => {
    const options = createOptions({});
    expect(await createBookFiles(options).addFromShares(() => undefined)).toEqual({ ok: true, data: null });
    expect(options.library.importBooks).not.toHaveBeenCalled();
  });

  it('rejects a share with no PDF in it, naming the file, and imports nothing', async () => {
    const options = createOptions({ shares: { takePending: async () => ok([photo]), onReceived: () => () => undefined } });
    const result = await createBookFiles(options).addFromShares(() => undefined);
    expect(result).toEqual({ ok: false, error: '"cat.jpg" is not a PDF. Taking Book can only add PDF files.' });
    expect(options.library.importBooks).not.toHaveBeenCalled();
  });

  it('imports the PDFs through the library import and reports the other files as skipped', async () => {
    const options = createOptions({ shares: { takePending: async () => ok([pdf, photo]), onReceived: () => () => undefined } });
    const result = await createBookFiles(options).addFromShares(() => undefined);
    expect(options.library.importBooks).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, data: { added: [], alreadyInLibrary: [], skipped: [{ fileName: 'cat.jpg', reason: 'not-pdf', detail: null }] } });
  });

  it('passes a failure to read the shares on to the reader', async () => {
    const shares = { takePending: async () => err('The shared files could not be read.'), onReceived: () => () => undefined };
    const result = await createBookFiles(createOptions({ shares })).addFromShares(() => undefined);
    expect(result).toEqual({ ok: false, error: 'The shared files could not be read.' });
  });
});
