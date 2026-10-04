import { err, isOk, ok, type ImportProgress, type ImportSummary, type LibraryService, type Result } from '@taking-book/core';
import { createPickedPdfImport, type IncomingBookStorage, type PickedPdf } from './picked-pdf-file-system';
import type { PickPdfs } from './pick-pdfs';
import type { ShareSource } from './share-intent';
import { sortSharedFiles } from './shared-pdfs';

/** What the reader API needs for adding Books and finding their files on this device. */
export interface BookFiles {
  /** Shows the file picker and imports the chosen PDFs; null when the picker was closed without a choice. */
  addFromPicker(onProgress: (progress: ImportProgress) => void): Promise<Result<ImportSummary | null>>;
  /** Imports the PDFs other apps shared since the last call; null when nothing was waiting. */
  addFromShares(onProgress: (progress: ImportProgress) => void): Promise<Result<ImportSummary | null>>;
  /** Listens for files shared while the app runs; returns the unsubscribe. */
  onSharesReceived(listener: () => void): () => void;
  checkReadable(storedPath: string): Promise<Result<void>>;
  getDocumentUrl(storedPath: string): string;
}

export interface BookFilesOptions {
  library: LibraryService;
  pickPdfs: PickPdfs;
  shares: ShareSource;
  storage: IncomingBookStorage;
  openStream: (webPath: string) => Promise<ReadableStream<Uint8Array>>;
  generateId: () => string;
  checkReadable: (storedPath: string) => Promise<Result<void>>;
  getDocumentUrl: (storedPath: string) => string;
  log: (message: string) => void;
}

function describeRejected(names: string[]): string {
  if (names.length === 1) return `"${names[0]}" is not a PDF. Taking Book can only add PDF files.`;
  return `${names.length} files are not PDFs. Taking Book can only add PDF files.`;
}

/**
 * Wires the picker, the share intent, the app's own book storage and the core
 * library import together. Every way of adding Books ends in the same
 * `LibraryService.importBooks`, so duplicates are found alike.
 *
 * @param options The library service and the platform pieces.
 * @returns The book-file operations of the Android reader API.
 */
export function createBookFiles(options: BookFilesOptions): BookFiles {
  const { library, pickPdfs, shares, storage, openStream, generateId, log } = options;

  async function importPdfs(picked: PickedPdf[], onProgress: (progress: ImportProgress) => void): Promise<Result<ImportSummary>> {
    const session = createPickedPdfImport({ picked, storage, openStream, generateId, log });
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
  }

  return {
    checkReadable: options.checkReadable,
    getDocumentUrl: options.getDocumentUrl,
    onSharesReceived: (listener) => shares.onReceived(listener),
    addFromPicker: async (onProgress) => {
      const picked = await pickPdfs();
      if (!isOk(picked)) return picked;
      if (picked.data === null) return ok(null);
      return importPdfs(picked.data, onProgress);
    },
    addFromShares: async (onProgress) => {
      const shared = await shares.takePending();
      if (!isOk(shared)) return shared;
      if (shared.data.length === 0) return ok(null);
      const { pdfs, rejected } = sortSharedFiles(shared.data);
      if (pdfs.length === 0) return err(describeRejected(rejected));
      const result = await importPdfs(pdfs, onProgress);
      if (!isOk(result)) return result;
      // The import notice reports files that were left out beside the Books that were added.
      const notPdf = rejected.map((fileName) => ({ fileName, reason: 'not-pdf' as const, detail: null }));
      return ok({ ...result.data, skipped: [...result.data.skipped, ...notPdf] });
    },
  };
}
