import { err, isOk, ok, type ImportProgress, type ImportSummary, type LibraryService, type Result } from '@taking-book/core';
import { createPickedPdfImport, type IncomingBookStorage } from './picked-pdf-file-system';
import type { PickPdfs } from './pick-pdfs';

/** What the reader API needs for adding Books and finding their files on this device. */
export interface BookFiles {
  /** Shows the file picker and imports the chosen PDFs; null when the picker was closed without a choice. */
  addFromPicker(onProgress: (progress: ImportProgress) => void): Promise<Result<ImportSummary | null>>;
  checkReadable(storedPath: string): Promise<Result<void>>;
  getDocumentUrl(storedPath: string): string;
}

export interface BookFilesOptions {
  library: LibraryService;
  pickPdfs: PickPdfs;
  storage: IncomingBookStorage;
  openStream: (webPath: string) => Promise<ReadableStream<Uint8Array>>;
  generateId: () => string;
  checkReadable: (storedPath: string) => Promise<Result<void>>;
  getDocumentUrl: (storedPath: string) => string;
  log: (message: string) => void;
}

/**
 * Wires the picker, the app's own book storage and the core library import
 * together. Every way of adding Books (the picker now, the share intent later)
 * should end in the same `LibraryService.importBooks`, so duplicates are found alike.
 *
 * @param options The library service and the platform pieces.
 * @returns The book-file operations of the Android reader API.
 */
export function createBookFiles(options: BookFilesOptions): BookFiles {
  const { library, pickPdfs, storage, openStream, generateId, log } = options;
  return {
    checkReadable: options.checkReadable,
    getDocumentUrl: options.getDocumentUrl,
    addFromPicker: async (onProgress) => {
      const picked = await pickPdfs();
      if (!isOk(picked)) return picked;
      if (picked.data === null) return ok(null);
      const session = createPickedPdfImport({ picked: picked.data, storage, openStream, generateId, log });
      const result = await library.importBooks({ paths: session.paths, fileSystem: session.fileSystem, onProgress });
      await session.discardLeftovers();
      if (!isOk(result)) {
        log(`Importing ${session.paths.length} picked file(s) failed: ${result.error}`);
        return err('The books could not be added to the Library.');
      }
      for (const skipped of result.data.skipped) {
        if (skipped.detail) log(`Import skipped ${skipped.fileName}: ${skipped.detail}`);
      }
      return result;
    },
  };
}
