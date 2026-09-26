import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The IPC half of the module needs Electron; only the file helpers are exercised here.
vi.mock('electron', () => ({ BrowserWindow: {}, app: {}, dialog: {}, ipcMain: {} }));

import { createCustomSoundFileSystem, customSoundFilePath } from './customSounds';

describe('createCustomSoundFileSystem', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'tb-custom-sounds-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports size, hashes the content and copies into the store, creating it if needed', async () => {
    const source = join(root, 'cafe.mp3');
    await writeFile(source, 'abc');
    const storeDir = join(root, 'store');
    const fileSystem = createCustomSoundFileSystem(storeDir);

    expect(await fileSystem.sizeOf(source)).toBe(3);
    const hash = await fileSystem.hashFile(source);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

    await fileSystem.copyToStore(source, hash);
    expect(await readFile(join(storeDir, hash), 'utf8')).toBe('abc');
  });
});

describe('customSoundFilePath', () => {
  it('locates the stored file for a content hash', () => {
    expect(customSoundFilePath('/data', 'a'.repeat(64))).toBe(join('/data', 'custom-sounds', 'a'.repeat(64)));
  });

  it.each(['../secret', 'abc', `${'a'.repeat(63)}/`, 'A'.repeat(64)])('refuses %j, which is not a content hash', (hash) => {
    expect(customSoundFilePath('/data', hash)).toBeNull();
  });
});
