import { beforeEach, describe, expect, it, vi } from 'vitest';

const filesystem = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn(), readdir: vi.fn() }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: filesystem, Directory: { Data: 'DATA' } }));
vi.mock('@capacitor/core', () => ({ Capacitor: {} }));

import { createBookSyncStorage } from './book-sync-storage';

describe('createBookSyncStorage', () => {
  beforeEach(() => {
    for (const method of Object.values(filesystem)) method.mockReset();
  });

  const storage = createBookSyncStorage();

  it('reads a Book by hash from the books folder', async () => {
    filesystem.readFile.mockResolvedValue({ data: 'AQID' });

    expect(await storage.readFile('blobs/abc')).toEqual({ ok: true, data: new Uint8Array([1, 2, 3]) });
    expect(filesystem.readFile).toHaveBeenCalledWith({ path: 'books/abc.pdf', directory: 'DATA' });
  });

  it('treats a Book that is not on the device as absent', async () => {
    filesystem.readFile.mockRejectedValue(new Error('File does not exist'));

    expect(await storage.readFile('blobs/abc')).toEqual({ ok: true, data: null });
  });

  it('writes a Book as base64 into the books folder', async () => {
    filesystem.writeFile.mockResolvedValue(undefined);

    expect(await storage.writeFile('blobs/abc', new Uint8Array([1, 2, 3]))).toEqual({ ok: true, data: undefined });
    expect(filesystem.writeFile).toHaveBeenCalledWith({ path: 'books/abc.pdf', data: 'AQID', directory: 'DATA', recursive: true });
  });

  it('holds nothing under other keys, such as the manifest', async () => {
    expect(await storage.readFile('manifest.json')).toEqual({ ok: true, data: null });
    expect((await storage.writeFile('manifest.json', new Uint8Array())).ok).toBe(false);
    expect(filesystem.readFile).not.toHaveBeenCalled();
  });

  it('lists the Books on the device as blob keys', async () => {
    filesystem.readdir.mockResolvedValue({ files: [{ name: 'abc.pdf' }, { name: 'def.pdf' }] });

    expect(await storage.listFiles('blobs/')).toEqual({ ok: true, data: ['blobs/abc', 'blobs/def'] });
  });

  it('reports a failed delete other than a missing file', async () => {
    filesystem.deleteFile.mockRejectedValue(new Error('Permission denied'));

    expect((await storage.deleteFile('blobs/abc')).ok).toBe(false);
  });
});
