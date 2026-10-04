import { Capacitor } from '@capacitor/core';
import type { PickedPdf } from './picked-pdf-file-system';
import type { SharedFile } from './share-intent';

/** Shared files split by whether the Library can take them. */
export interface SortedShares {
  pdfs: PickedPdf[];
  /** The names of the files that are not PDFs. */
  rejected: string[];
}

const PDF_MIME_TYPE = 'application/pdf';
// Senders that do not know the type (a download manager, a file manager) declare one of these.
const UNSPECIFIC_MIME_TYPES = ['application/octet-stream', 'binary/octet-stream'];

function isPdf(file: SharedFile): boolean {
  const mimeType = file.mimeType?.toLowerCase() ?? null;
  if (mimeType === PDF_MIME_TYPE) return true;
  const typeUnknown = mimeType === null || UNSPECIFIC_MIME_TYPES.includes(mimeType);
  return typeUnknown && file.name.toLowerCase().endsWith('.pdf');
}

// The import recognises Books by their file name, but a shared PDF may arrive without the extension.
function withPdfExtension(name: string): string {
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

/**
 * Separates the PDFs among shared files from everything else, so the same import
 * as the file picker's can take the PDFs and the rest can be reported.
 *
 * @param files The files the native plugin received.
 * @param toWebUrl Turns a content URI into a URL the WebView can read the file from.
 * @returns The PDFs, ready for the import, and the names of the files left out.
 */
export function sortSharedFiles(files: SharedFile[], toWebUrl: (uri: string) => string = (uri) => Capacitor.convertFileSrc(uri)): SortedShares {
  const sorted: SortedShares = { pdfs: [], rejected: [] };
  for (const file of files) {
    if (isPdf(file)) sorted.pdfs.push({ name: withPdfExtension(file.name), webPath: toWebUrl(file.uri) });
    else sorted.rejected.push(file.name);
  }
  return sorted;
}
