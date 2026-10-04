import { FilePicker } from '@capawesome/capacitor-file-picker';
import { err, ok, type Result } from '@taking-book/core';
import type { PickedPdf } from './picked-pdf-file-system';

/** Shows the system file picker for PDFs. */
export type PickPdfs = () => Promise<Result<PickedPdf[] | null>>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCancellation(error: unknown): boolean {
  return /cancel/i.test(errorMessage(error));
}

/**
 * Opens the system file picker, limited to PDFs, with no limit on how many are
 * chosen. The picker returns a temporary content URI; only a WebView URL for it
 * is kept, and only until the import has read the file.
 *
 * @returns The chosen PDFs; null when the reader closed the picker without choosing.
 */
export const pickPdfs: PickPdfs = async () => {
  try {
    const { files } = await FilePicker.pickFiles({ types: ['application/pdf'], limit: 0, readData: false });
    const picked = files.flatMap((file) => (file.webPath ? [{ name: file.name, webPath: file.webPath }] : []));
    return ok(picked);
  } catch (error) {
    if (isCancellation(error)) return ok(null);
    console.error(`The file picker failed: ${errorMessage(error)}`);
    return err('The file picker could not be opened.');
  }
};
