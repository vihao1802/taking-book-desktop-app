import type { ImportFileSystem } from '@taking-book/core';
import { hashAndCopyStream } from './stream-blocks';

/** A PDF the reader chose in the system picker. Its URI is used only during the import, never stored. */
export interface PickedPdf {
  name: string;
  /** A URL the WebView can fetch the picked file's bytes from. */
  webPath: string;
}

/** The app's private storage for Books, as the import needs it. */
export interface IncomingBookStorage {
  /** Starts an empty temporary file, replacing any left from an earlier run. */
  create(temporaryPath: string): Promise<void>;
  append(temporaryPath: string, block: Uint8Array): Promise<void>;
  /** Moves a finished temporary file to the place for its hash; returns the stored path. */
  commit(temporaryPath: string, hash: string): Promise<string>;
  discard(temporaryPath: string): Promise<void>;
}

export interface PickedPdfImportOptions {
  picked: PickedPdf[];
  storage: IncomingBookStorage;
  openStream: (webPath: string) => Promise<ReadableStream<Uint8Array>>;
  /** Makes the temporary file names unique within one import. */
  generateId: () => string;
  log: (message: string) => void;
}

/** One import of picked PDFs: the paths to hand to `importBooks`, its file system, and the cleanup to run after. */
export interface PickedPdfImport {
  paths: string[];
  fileSystem: ImportFileSystem;
  /** Deletes the temporary copies of files that were hashed but not stored (already in the Library). */
  discardLeftovers(): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// importBooks names a Book after the last segment of its path, so each picked file gets
// a made-up path ending in its real name; the real URI never leaves this module.
function virtualPathFor(index: number, name: string): string {
  return `picked/${index}/${name.replace(/[\\/]/g, '_')}`;
}

/**
 * Lets core's `importBooks` import files chosen in the Android picker. Hashing
 * and copying happen in one pass: hashing a file streams it into a temporary
 * file in app storage, and storing it renames that file to its hash, so the PDF
 * is read once and never held in memory whole.
 *
 * @param options The picked files, app storage, byte source and logging.
 * @returns The paths and file system for `importBooks`, plus the leftover cleanup.
 */
export function createPickedPdfImport(options: PickedPdfImportOptions): PickedPdfImport {
  const { picked, storage, openStream, generateId, log } = options;
  const run = generateId();
  const sources = new Map<string, { pdf: PickedPdf; temporaryPath: string }>();
  const hashed = new Map<string, string>();
  const paths = picked.map((pdf, index) => {
    const path = virtualPathFor(index, pdf.name);
    sources.set(path, { pdf, temporaryPath: `books/incoming-${run}-${index}.part` });
    return path;
  });

  function sourceOf(path: string): { pdf: PickedPdf; temporaryPath: string } {
    const source = sources.get(path);
    if (!source) throw new Error(`${path} was not chosen in this import`);
    return source;
  }

  const fileSystem: ImportFileSystem = {
    stat: async (path) => {
      sourceOf(path);
      return 'file';
    },
    listDirectory: async () => [],
    hashFile: async (path) => {
      const { pdf, temporaryPath } = sourceOf(path);
      await storage.create(temporaryPath);
      try {
        const hash = await hashAndCopyStream(await openStream(pdf.webPath), {
          write: (block) => storage.append(temporaryPath, block),
        });
        // The same PDF picked twice: the first copy is still waiting to be stored, so this one is surplus.
        if (hashed.has(hash)) await storage.discard(temporaryPath);
        else hashed.set(hash, temporaryPath);
        return hash;
      } catch (error) {
        await storage.discard(temporaryPath).catch((discardError: unknown) => {
          log(`Could not delete the partial copy ${temporaryPath}: ${errorMessage(discardError)}`);
        });
        throw error;
      }
    },
    copyToStore: async (_path, hash) => {
      const temporaryPath = hashed.get(hash);
      if (temporaryPath === undefined) throw new Error(`No copy of ${hash} was made while hashing`);
      const storedPath = await storage.commit(temporaryPath, hash);
      hashed.delete(hash);
      return storedPath;
    },
  };

  async function discardLeftovers(): Promise<void> {
    for (const temporaryPath of hashed.values()) {
      await storage.discard(temporaryPath).catch((error: unknown) => {
        log(`Could not delete the unused copy ${temporaryPath}: ${errorMessage(error)}`);
      });
    }
    hashed.clear();
  }

  return { paths, fileSystem, discardLeftovers };
}
