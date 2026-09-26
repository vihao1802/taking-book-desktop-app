import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createImportFileSystem } from './importFileSystem';

describe('createImportFileSystem listDirectory', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tb-import-fs-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists files and subfolders as full paths, in natural name order', async () => {
    await writeFile(join(root, 'Chapter 10.pdf'), '');
    await writeFile(join(root, 'Chapter 2.pdf'), '');
    await mkdir(join(root, 'extras'));

    const children = await createImportFileSystem(root).listDirectory(root);

    expect(children).toEqual([join(root, 'Chapter 2.pdf'), join(root, 'Chapter 10.pdf'), join(root, 'extras')]);
  });

  it('leaves out hidden files such as .DS_Store', async () => {
    await writeFile(join(root, '.DS_Store'), '');
    await writeFile(join(root, 'book.pdf'), '');

    const children = await createImportFileSystem(root).listDirectory(root);

    expect(children).toEqual([join(root, 'book.pdf')]);
  });

  it('leaves out links to folders, so a link back to a parent cannot loop, but keeps links to files', async () => {
    await mkdir(join(root, 'inner'));
    await writeFile(join(root, 'real.pdf'), '');
    await symlink(root, join(root, 'inner', 'loop'));
    await symlink(join(root, 'real.pdf'), join(root, 'inner', 'linked.pdf'));

    const children = await createImportFileSystem(root).listDirectory(join(root, 'inner'));

    expect(children).toEqual([join(root, 'inner', 'linked.pdf')]);
  });
});
