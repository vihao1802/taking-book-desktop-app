import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { err, ok, type Result } from '@taking-book/core';
import { bytesToBase64 } from './bytes-to-base64';
import type { IncomingBookStorage } from './picked-pdf-file-system';

/** The folder, inside the app's private data folder, that holds the Books. */
export const BOOK_FOLDER = 'books';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isFileMissing(error: unknown): boolean {
  return /does not exist|no such file|not found/i.test(errorMessage(error));
}

/** The path, inside the app's private data folder, where the Book with this hash is kept. */
export function bookPathFor(hash: string): string {
  return `${BOOK_FOLDER}/${hash}.pdf`;
}

async function deleteIfPresent(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch (error) {
    if (!isFileMissing(error)) throw error;
  }
}

/**
 * Keeps Books in the app's private data folder, one file per content hash, so a
 * Book still opens after the original is deleted or moved.
 *
 * @returns The storage the import writes into.
 */
export function createCapacitorBookStorage(): IncomingBookStorage {
  return {
    create: async (temporaryPath) => {
      await Filesystem.writeFile({ path: temporaryPath, data: '', directory: Directory.Data, recursive: true });
    },
    append: async (temporaryPath, block) => {
      await Filesystem.appendFile({ path: temporaryPath, data: bytesToBase64(block), directory: Directory.Data });
    },
    commit: async (temporaryPath, hash) => {
      const storedPath = bookPathFor(hash);
      // A Book deleted earlier and added again leaves its old file behind; rename does not replace it.
      await deleteIfPresent(storedPath);
      await Filesystem.rename({
        from: temporaryPath,
        to: storedPath,
        directory: Directory.Data,
        toDirectory: Directory.Data,
      });
      return storedPath;
    },
    discard: (temporaryPath) => deleteIfPresent(temporaryPath),
  };
}

/**
 * Checks that a Book's stored file can still be read.
 *
 * @param storedPath The Book's path inside the app data folder.
 * @returns Ok when the file is there, otherwise an error worded for the reader.
 */
export async function checkBookReadable(storedPath: string): Promise<Result<void>> {
  try {
    await Filesystem.stat({ path: storedPath, directory: Directory.Data });
    return ok(undefined);
  } catch (error) {
    console.error(`Could not read the stored book ${storedPath}: ${errorMessage(error)}`);
    return err('This book’s PDF is not on this device. Open its details in the Library to see why and download it.');
  }
}

/**
 * Whether a Book's PDF is on this device. Unlike {@link checkBookReadable} it
 * says nothing when the file is missing, since a Remote-only Book is normal.
 *
 * @param storedPath The Book's path inside the app data folder.
 */
export async function isBookOnDevice(storedPath: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path: storedPath, directory: Directory.Data });
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds where the app data folder is on disk, once at start-up, so the
 * reader API can build a WebView URL for a stored Book without an async call.
 *
 * @returns A function turning a Book's stored path into a URL pdf.js can load.
 */
export async function createDocumentUrlResolver(): Promise<Result<(storedPath: string) => string>> {
  try {
    const { uri } = await Filesystem.getUri({ path: BOOK_FOLDER, directory: Directory.Data });
    // Android reports a folder with a trailing slash, other platforms without one.
    const folderUri = uri.replace(/\/+$/, '');
    if (!folderUri.endsWith(`/${BOOK_FOLDER}`)) return err(`Unexpected app data location: ${uri}`);
    const dataFolderUri = folderUri.slice(0, folderUri.length - BOOK_FOLDER.length);
    return ok((storedPath) => Capacitor.convertFileSrc(`${dataFolderUri}${storedPath}`));
  } catch (error) {
    return err(`Could not locate the app data folder: ${errorMessage(error)}`);
  }
}
