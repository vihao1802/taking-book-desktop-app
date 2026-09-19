import { describe, expect, it } from 'vitest';
import {
  deleteFile,
  filesSchema,
  getFileZoom,
  getLastPosition,
  listFiles,
  saveLastPosition,
  setFileStatus,
  setFileTags,
  setFileTitle,
  setFileZoom,
  upsertFile,
} from '../src';
import { isOk } from '../src';
import { createMemoryDriver } from './helpers';

describe('filesRepository', () => {
  it('registers a new file and returns its record', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());

    const result = await upsertFile(db, {
      filePath: '/books/one.pdf',
      hash: 'abc123',
      title: 'One',
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.data.hash).toBe('abc123');
      expect(result.data.path).toBe('/books/one.pdf');
      expect(result.data.status).toBe('unread');
      expect(result.data.tags).toEqual([]);
      expect(result.data.lastPage).toBeNull();
      expect(result.data.id).toBeGreaterThan(0);
    }
  });

  it('updates the path and returns the same id for a duplicate hash', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());

    const first = await upsertFile(db, { filePath: '/old.pdf', hash: 'same', title: 'T' });
    const second = await upsertFile(db, { filePath: '/new.pdf', hash: 'same', title: 'T' });

    expect(isOk(first) && isOk(second)).toBe(true);
    if (isOk(first) && isOk(second)) {
      expect(second.data.id).toBe(first.data.id);
      expect(second.data.path).toBe('/new.pdf');
    }
  });

  it('revives a deleted file when the same bytes are added again', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/g.pdf', hash: 'h-revive', title: 'G' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    await deleteFile(db, created.data.id);
    let list = await listFiles(db);
    expect(isOk(list) && list.data.length === 0).toBe(true);

    const readd = await upsertFile(db, { filePath: '/g-new.pdf', hash: 'h-revive', title: 'G' });
    expect(isOk(readd)).toBe(true);
    if (isOk(readd)) expect(readd.data.id).toBe(created.data.id);

    list = await listFiles(db);
    expect(isOk(list)).toBe(true);
    if (isOk(list)) {
      expect(list.data.map((f) => f.title)).toEqual(['G']);
    }
  });

  it('treats a corrupt tags column as an empty tag list', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await db.run("INSERT INTO files (hash, path, title, tags) VALUES ('h', '/p', 't', 'not-json')");

    const result = await upsertFile(db, { filePath: '/moved.pdf', hash: 'h', title: 't' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.data.tags).toEqual([]);
  });

  it('saves and reads back the last position', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/b.pdf', hash: 'h2', title: 'B' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const saved = await saveLastPosition(db, created.data.id, { page: 42, position: 0.5, mode: 'page' });
    expect(isOk(saved)).toBe(true);

    const loaded = await getLastPosition(db, created.data.id);
    expect(isOk(loaded)).toBe(true);
    if (isOk(loaded)) {
      expect(loaded.data).toEqual({ page: 42, position: 0.5, mode: 'page' });
    }
  });

  it('stamps lastReadAt when a position is saved and leaves it null before', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/c.pdf', hash: 'h3', title: 'C' });
    if (!isOk(created)) return;
    expect(created.data.lastReadAt).toBeNull();

    await saveLastPosition(db, created.data.id, { page: 2, position: 0.1, mode: 'page' }, { updatedAt: 777, updatedBy: 'dev' });
    const listed = await listFiles(db);
    if (isOk(listed)) expect(listed.data[0]?.lastReadAt).toBe(777);
  });

  it('round-trips the reflow mode and defaults legacy rows to page mode', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/b.pdf', hash: 'h2', title: 'B' });
    if (!isOk(created)) return;

    const saved = await saveLastPosition(db, created.data.id, { page: 1, position: 0.75, mode: 'reflow' });
    expect(isOk(saved)).toBe(true);

    const loaded = await getLastPosition(db, created.data.id);
    expect(isOk(loaded) && loaded.data?.mode === 'reflow').toBe(true);

    // A row written before last_mode existed reads as page mode.
    const raw = createMemoryDriver();
    await raw.exec(filesSchema());
    await raw.run("INSERT INTO files (hash, path, title, last_page, last_position) VALUES ('h9', '/x.pdf', 'X', 5, 0.2)", []);
    const legacy = await raw.all('SELECT last_mode FROM files', []);
    expect(legacy[0]?.last_mode ?? null).toBeNull();
    const listed = await listFiles(raw);
    if (isOk(listed)) expect(listed.data[0]?.lastMode).toBe('page');
  });

  it('saves and reads back the zoom level, returning null before it is set', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/z.pdf', hash: 'h-z', title: 'Z' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const before = await getFileZoom(db, created.data.id);
    expect(isOk(before) && before.data === null).toBe(true);

    const saved = await setFileZoom(db, created.data.id, 1.5);
    expect(isOk(saved)).toBe(true);

    const after = await getFileZoom(db, created.data.id);
    expect(isOk(after) && after.data).toBe(1.5);

    // The zoom also round-trips through the library listing.
    const list = await listFiles(db);
    expect(isOk(list)).toBe(true);
    if (isOk(list)) expect(list.data[0].zoom).toBe(1.5);
  });

  it('returns null zoom for an unknown file id', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const loaded = await getFileZoom(db, 999);
    expect(isOk(loaded) && loaded.data === null).toBe(true);
  });

  it('returns null position for a file that was never opened', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/c.pdf', hash: 'h3', title: 'C' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const loaded = await getLastPosition(db, created.data.id);
    expect(isOk(loaded) && loaded.data === null).toBe(true);
  });

  it('returns a null position for an unknown file id', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const loaded = await getLastPosition(db, 999);
    expect(isOk(loaded) && loaded.data === null).toBe(true);
  });

  it('lists files newest first', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await upsertFile(db, { filePath: '/a.pdf', hash: 'h-a', title: 'A' });
    await upsertFile(db, { filePath: '/b.pdf', hash: 'h-b', title: 'B' });

    const list = await listFiles(db);
    expect(isOk(list)).toBe(true);
    if (isOk(list)) {
      expect(list.data.map((f) => f.title)).toEqual(['B', 'A']);
    }
  });

  it('sets the reading status', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/d.pdf', hash: 'h-d', title: 'D' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const set = await setFileStatus(db, created.data.id, 'finished');
    expect(isOk(set)).toBe(true);

    const list = await listFiles(db);
    expect(isOk(list)).toBe(true);
    if (isOk(list)) expect(list.data[0].status).toBe('finished');
  });

  it('errors when setting status for a missing file', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const result = await setFileStatus(db, 404, 'reading');
    expect(result.ok).toBe(false);
  });

  it('sets tags, trimming blanks and removing duplicates', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/e.pdf', hash: 'h-e', title: 'E' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const set = await setFileTags(db, created.data.id, ['  work ', '', 'work', 'fiction']);
    expect(isOk(set)).toBe(true);

    const list = await listFiles(db);
    expect(isOk(list)).toBe(true);
    if (isOk(list)) expect(list.data[0].tags).toEqual(['work', 'fiction']);
  });

  it('renames a file title', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const created = await upsertFile(db, { filePath: '/f.pdf', hash: 'h-f', title: 'Old Title' });
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;

    const renamed = await setFileTitle(db, created.data.id, 'New Title');
    expect(isOk(renamed)).toBe(true);

    const list = await listFiles(db);
    expect(isOk(list)).toBe(true);
    if (isOk(list)) expect(list.data[0].title).toBe('New Title');
  });

  it('errors when renaming a missing file', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    const result = await setFileTitle(db, 404, 'X');
    expect(result.ok).toBe(false);
  });
});
