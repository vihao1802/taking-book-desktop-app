import { beforeEach, describe, expect, it, vi } from 'vitest';

const filesystem = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: filesystem,
  Directory: { Data: 'DATA' },
  Encoding: { UTF8: 'utf8' },
}));

import { createFilesystemTextStore } from './filesystem-text-store';

describe('createFilesystemTextStore', () => {
  beforeEach(() => {
    filesystem.readFile.mockReset();
    filesystem.writeFile.mockReset();
  });

  const textStore = createFilesystemTextStore({ folder: 'reflow', extension: 'json', label: 'reflow text', encoding: 'utf8' });
  const binaryStore = createFilesystemTextStore({ folder: 'covers', extension: 'jpg', label: 'cover', encoding: 'base64' });

  it('reads a stored file by its hash', async () => {
    filesystem.readFile.mockResolvedValue({ data: '{"a":1}' });
    expect(await textStore.read('abc')).toEqual({ ok: true, data: '{"a":1}' });
    expect(filesystem.readFile).toHaveBeenCalledWith({ path: 'reflow/abc.json', directory: 'DATA', encoding: 'utf8' });
  });

  it('treats a file that does not exist as not stored', async () => {
    filesystem.readFile.mockRejectedValue(new Error('File does not exist'));
    expect(await textStore.read('abc')).toEqual({ ok: true, data: null });
  });

  it('reports any other read failure as an error naming the thing and its hash', async () => {
    filesystem.readFile.mockRejectedValue(new Error('Permission denied'));
    const result = await binaryStore.read('abc');
    expect(result).toEqual({ ok: false, error: 'Failed to read cover for abc: Permission denied' });
  });

  it('reads binary files without an encoding so the plugin returns base64', async () => {
    filesystem.readFile.mockResolvedValue({ data: 'AAEC' });
    await binaryStore.read('abc');
    expect(filesystem.readFile).toHaveBeenCalledWith({ path: 'covers/abc.jpg', directory: 'DATA', encoding: undefined });
  });

  it('writes into its folder, creating it when missing', async () => {
    filesystem.writeFile.mockResolvedValue({ uri: 'x' });
    expect(await textStore.write('abc', 'hello')).toEqual({ ok: true, data: undefined });
    expect(filesystem.writeFile).toHaveBeenCalledWith({
      path: 'reflow/abc.json',
      directory: 'DATA',
      data: 'hello',
      encoding: 'utf8',
      recursive: true,
    });
  });

  it('reports a failed write as an error instead of throwing', async () => {
    filesystem.writeFile.mockRejectedValue(new Error('Disk full'));
    expect(await textStore.write('abc', 'hello')).toEqual({ ok: false, error: 'Failed to cache reflow text for abc: Disk full' });
  });
});
