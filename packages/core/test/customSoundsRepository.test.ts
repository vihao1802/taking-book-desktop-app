import { describe, expect, it } from 'vitest';
import { addCustomSound, customSoundsSchema, deleteCustomSound, listCustomSounds, renameCustomSound } from '../src';
import { createMemoryDriver } from './helpers';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

async function createDatabase() {
  const db = createMemoryDriver();
  await db.exec(customSoundsSchema());
  return db;
}

describe('customSoundsRepository', () => {
  it('lists Custom sounds in the order they were added', async () => {
    const db = await createDatabase();
    await addCustomSound(db, { contentHash: HASH_B, name: 'Trains' });
    await addCustomSound(db, { contentHash: HASH_A, name: 'Cafe' });
    expect(await listCustomSounds(db)).toEqual({
      ok: true,
      data: [
        { contentHash: HASH_B, name: 'Trains' },
        { contentHash: HASH_A, name: 'Cafe' },
      ],
    });
  });

  it('reuses the existing Custom sound when the same audio is added again', async () => {
    const db = await createDatabase();
    await addCustomSound(db, { contentHash: HASH_A, name: 'Cafe' });
    const again = await addCustomSound(db, { contentHash: HASH_A, name: 'Other name' });
    expect(again).toEqual({ ok: true, data: { sound: { contentHash: HASH_A, name: 'Cafe' }, alreadyAdded: true } });
    const listed = await listCustomSounds(db);
    expect(listed.ok && listed.data).toHaveLength(1);
  });

  it('reports a newly added Custom sound as not already added', async () => {
    const db = await createDatabase();
    expect(await addCustomSound(db, { contentHash: HASH_A, name: 'Cafe' })).toEqual({
      ok: true,
      data: { sound: { contentHash: HASH_A, name: 'Cafe' }, alreadyAdded: false },
    });
  });

  it('renames a Custom sound', async () => {
    const db = await createDatabase();
    await addCustomSound(db, { contentHash: HASH_A, name: 'Cafe' });
    expect(await renameCustomSound(db, HASH_A, '  Coffee shop ')).toEqual({ ok: true, data: undefined });
    const listed = await listCustomSounds(db);
    expect(listed.ok && listed.data[0].name).toBe('Coffee shop');
  });

  it('rejects an invalid name and an unknown Custom sound when renaming', async () => {
    const db = await createDatabase();
    await addCustomSound(db, { contentHash: HASH_A, name: 'Cafe' });
    expect(await renameCustomSound(db, HASH_A, '   ')).toEqual({ ok: false, error: 'Enter a name of up to 60 characters.' });
    expect(await renameCustomSound(db, HASH_B, 'Nope')).toEqual({ ok: false, error: 'That sound no longer exists.' });
  });

  it('deletes a Custom sound', async () => {
    const db = await createDatabase();
    await addCustomSound(db, { contentHash: HASH_A, name: 'Cafe' });
    expect(await deleteCustomSound(db, HASH_A)).toEqual({ ok: true, data: undefined });
    const listed = await listCustomSounds(db);
    expect(listed.ok && listed.data).toEqual([]);
  });
});
