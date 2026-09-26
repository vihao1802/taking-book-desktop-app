import { describe, expect, it } from 'vitest';
import { MAX_CUSTOM_SOUND_BYTES, addCustomSounds, customSoundsSchema, listCustomSounds, type CustomSoundFileSystem } from '../src';
import { createMemoryDriver } from './helpers';

interface FakeFile {
  sizeBytes: number;
  hash: string;
}

function createFakeFileSystem(files: Record<string, FakeFile>): CustomSoundFileSystem & { stored: string[] } {
  const stored: string[] = [];
  return {
    stored,
    async sizeOf(path) {
      const file = files[path];
      if (!file) throw new Error('ENOENT');
      return file.sizeBytes;
    },
    async hashFile(path) {
      return files[path].hash;
    },
    async copyToStore(path, hash) {
      stored.push(hash);
    },
  };
}

async function createDatabase() {
  const db = createMemoryDriver();
  await db.exec(customSoundsSchema());
  return db;
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('addCustomSounds', () => {
  it('copies each file into the store and names it after the file', async () => {
    const db = await createDatabase();
    const fileSystem = createFakeFileSystem({ '/m/Rainy Cafe.mp3': { sizeBytes: 100, hash: HASH_A } });
    const result = await addCustomSounds(db, { paths: ['/m/Rainy Cafe.mp3'], fileSystem });
    expect(result).toEqual({ ok: true, data: { added: [{ contentHash: HASH_A, name: 'Rainy Cafe', fileName: 'Rainy Cafe.mp3' }], alreadyAdded: 0, rejected: [] } });
    expect(fileSystem.stored).toEqual([HASH_A]);
  });

  it('counts the same audio added twice once, and does not copy it again', async () => {
    const db = await createDatabase();
    const fileSystem = createFakeFileSystem({ '/a.mp3': { sizeBytes: 1, hash: HASH_A }, '/copy.mp3': { sizeBytes: 1, hash: HASH_A } });
    const result = await addCustomSounds(db, { paths: ['/a.mp3', '/copy.mp3'], fileSystem });
    expect(result.ok && result.data.added).toHaveLength(1);
    expect(result.ok && result.data.alreadyAdded).toBe(1);
    expect(fileSystem.stored).toEqual([HASH_A]);
  });

  it('rejects an empty file and an oversized file with a clear reason, and still adds the rest', async () => {
    const db = await createDatabase();
    const fileSystem = createFakeFileSystem({
      '/empty.mp3': { sizeBytes: 0, hash: HASH_A },
      '/huge.wav': { sizeBytes: MAX_CUSTOM_SOUND_BYTES + 1, hash: HASH_A },
      '/ok.ogg': { sizeBytes: 5, hash: HASH_B },
    });
    const result = await addCustomSounds(db, { paths: ['/empty.mp3', '/huge.wav', '/ok.ogg'], fileSystem });
    expect(result).toEqual({
      ok: true,
      data: {
        added: [{ contentHash: HASH_B, name: 'ok', fileName: 'ok.ogg' }],
        alreadyAdded: 0,
        rejected: [
          { fileName: 'empty.mp3', reason: 'The file is empty.', detail: undefined },
          { fileName: 'huge.wav', reason: 'The file is over 50 MB.', detail: undefined },
        ],
      },
    });
    expect(fileSystem.stored).toEqual([HASH_B]);
  });

  it('rejects a file that cannot be read', async () => {
    const db = await createDatabase();
    const result = await addCustomSounds(db, { paths: ['/gone.mp3'], fileSystem: createFakeFileSystem({}) });
    expect(result.ok && result.data.rejected).toEqual([{ fileName: 'gone.mp3', reason: 'The file could not be read.', detail: 'ENOENT' }]);
  });

  it('does not keep a sound whose audio could not be copied', async () => {
    const db = await createDatabase();
    const fileSystem = createFakeFileSystem({ '/a.mp3': { sizeBytes: 1, hash: HASH_A } });
    fileSystem.copyToStore = async () => {
      throw new Error('disk full');
    };
    const result = await addCustomSounds(db, { paths: ['/a.mp3'], fileSystem });
    expect(result.ok && result.data.rejected).toEqual([{ fileName: 'a.mp3', reason: 'The file could not be read.', detail: 'disk full' }]);
    expect(await listCustomSounds(db)).toEqual({ ok: true, data: [] });
  });

  it('stores the sounds in the database', async () => {
    const db = await createDatabase();
    const fileSystem = createFakeFileSystem({ '/a.mp3': { sizeBytes: 1, hash: HASH_A } });
    await addCustomSounds(db, { paths: ['/a.mp3'], fileSystem });
    expect(await listCustomSounds(db)).toEqual({ ok: true, data: [{ contentHash: HASH_A, name: 'a' }] });
  });
});
