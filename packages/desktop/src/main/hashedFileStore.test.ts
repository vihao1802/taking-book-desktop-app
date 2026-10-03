import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHashedFileStore } from './hashedFileStore';

describe('createHashedFileStore', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hashed-store-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports a missing entry as null, not an error', async () => {
    const store = createHashedFileStore({ dir: join(root, 'none'), extension: 'json', label: 'x', encoding: 'utf8' });
    expect(await store.read('h')).toEqual({ ok: true, data: null });
  });

  it('creates the directory on first write and reads the text back', async () => {
    const store = createHashedFileStore({ dir: join(root, 'sub'), extension: 'json', label: 'x', encoding: 'utf8' });
    expect((await store.write('h', '{"a":1}')).ok).toBe(true);
    expect(await store.read('h')).toEqual({ ok: true, data: '{"a":1}' });
  });

  it('writes base64 text as the raw bytes, and reads existing binary files back as base64', async () => {
    const dir = join(root, 'covers');
    const store = createHashedFileStore({ dir, extension: 'jpg', label: 'cover', encoding: 'base64' });
    await store.write('h', 'QUJD');
    expect((await readFile(join(dir, 'h.jpg'))).toString('latin1')).toBe('ABC');
    await writeFile(join(dir, 'old.jpg'), Buffer.from([0xff, 0xd8, 0x00]));
    expect(await store.read('old')).toEqual({ ok: true, data: '/9gA' });
  });

  it('reports a read failure other than a missing file', async () => {
    const store = createHashedFileStore({ dir: root, extension: 'json', label: 'reflow text', encoding: 'utf8' });
    await mkdir(join(root, 'h.json'));
    const result = await store.read('h');
    expect(result.ok).toBe(false);
  });
});
