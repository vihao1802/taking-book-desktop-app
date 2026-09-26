import type { ImportFileSystem } from '@taking-book/core';
import { copyFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256File } from './hash';

const byNaturalName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Node-backed file system for core's importBooks, copying Books into the given blob store directory. */
export function createImportFileSystem(blobDir: string): ImportFileSystem {
  return {
    async stat(path) {
      return (await stat(path)).isDirectory() ? 'directory' : 'file';
    },
    listDirectory,
    hashFile: sha256File,
    async copyToStore(path, hash) {
      const storedPath = join(blobDir, hash);
      await copyFile(path, storedPath);
      return storedPath;
    },
  };
}

/**
 * A folder's children in the order a file manager shows them. Hidden entries
 * (such as .DS_Store) are left out: the reader never chose them, so reporting
 * them as skipped would only be noise. Links to folders are left out so a link
 * back to a parent cannot make the walk endless.
 */
async function listDirectory(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => byNaturalName.compare(a.name, b.name));
  const children: string[] = [];
  for (const entry of visible) {
    const child = join(dir, entry.name);
    if (entry.isSymbolicLink() && (await isLinkToDirectory(child))) continue;
    children.push(child);
  }
  return children;
}

async function isLinkToDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    // A broken link is kept; the import's own stat then reports it as unreadable by name.
    return false;
  }
}
