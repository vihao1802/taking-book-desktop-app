import { describe, expect, it } from 'vitest';
import {
  annotationsSchema,
  applyRecordAnnotations,
  applySyncRecords,
  createAnnotation,
  deleteAnnotation,
  deriveAnnotationUid,
  filesSchema,
  isOk,
  listAnnotations,
  listAnnotationsForSync,
  listRecordsForSync,
  migrateAnnotationsSchema,
  parseManifest,
  setAnnotationNote,
  syncLibrary,
  upsertFile,
} from '../src';
import type { CreateAnnotationInput, SqlDriver, SyncAnnotation } from '../src';
import { utf8Decode, utf8Encode } from '../src/sync/utf8';
import { createMemoryDriver, createMemoryStorage, sequentialUids } from './helpers';

const HASH = 'book-hash';

function highlight(quote: string, page = 1): CreateAnnotationInput {
  return {
    page,
    pageStart: 0,
    pageEnd: quote.length,
    quote,
    color: 'yellow',
    note: null,
    paraIndex: null,
    paraStart: null,
    paraEnd: null,
  };
}

function remoteAnnotation(overrides: Partial<SyncAnnotation> = {}): SyncAnnotation {
  return {
    id: 1,
    uid: 'u1',
    page: 1,
    pageStart: 0,
    pageEnd: 5,
    quote: 'quote',
    color: 'yellow',
    note: null,
    paraIndex: null,
    paraStart: null,
    paraEnd: null,
    updatedAt: 100,
    updatedBy: 'dev-remote',
    deleted: false,
    ...overrides,
  };
}

/** A database as a build of this app before annotation uids existed left it. */
const LEGACY_ANNOTATIONS_DDL = `
  CREATE TABLE annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_hash TEXT NOT NULL,
    page INTEGER NOT NULL,
    page_start INTEGER,
    page_end INTEGER,
    quote TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'yellow',
    note TEXT,
    para_index INTEGER,
    para_start INTEGER,
    para_end INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT NOT NULL DEFAULT '',
    deleted_at INTEGER
  );
`;

/** The annotation validation rules of a build from before uids, copied verbatim: extra keys are ignored. */
function acceptedByOlderBuild(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'number' &&
    typeof value.page === 'number' &&
    (value.pageStart == null || typeof value.pageStart === 'number') &&
    (value.pageEnd == null || typeof value.pageEnd === 'number') &&
    typeof value.quote === 'string' &&
    typeof value.color === 'string' &&
    ['yellow', 'green', 'blue', 'pink'].includes(value.color) &&
    (value.note == null || typeof value.note === 'string') &&
    (value.paraIndex == null || typeof value.paraIndex === 'number') &&
    (value.paraStart == null || typeof value.paraStart === 'number') &&
    (value.paraEnd == null || typeof value.paraEnd === 'number') &&
    typeof value.updatedAt === 'number' &&
    typeof value.updatedBy === 'string' &&
    typeof value.deleted === 'boolean'
  );
}

async function createDevice(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await db.exec(`${filesSchema()} ${annotationsSchema()}`);
  expect(isOk(await migrateAnnotationsSchema(db))).toBe(true);
  expect(isOk(await upsertFile(db, { filePath: '/book.pdf', hash: HASH, title: 'Book' }))).toBe(true);
  return db;
}

async function createLegacyDevice(rows: { id: number; quote: string }[]): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await db.exec(filesSchema());
  await db.exec(LEGACY_ANNOTATIONS_DDL);
  expect(isOk(await upsertFile(db, { filePath: '/book.pdf', hash: HASH, title: 'Book' }))).toBe(true);
  for (const row of rows) {
    await db.run(
      `INSERT INTO annotations (id, file_hash, page, page_start, page_end, quote, updated_at, updated_by)
       VALUES (?, ?, 1, 0, 5, ?, 50, 'old-device')`,
      [row.id, HASH, row.quote],
    );
  }
  expect(isOk(await migrateAnnotationsSchema(db))).toBe(true);
  return db;
}

async function syncDevice(db: SqlDriver, remote: ReturnType<typeof createMemoryStorage>): Promise<void> {
  const result = await syncLibrary(db, {
    local: createMemoryStorage(),
    remote,
    resolveLocalPath: (hash) => `/blobs/${hash}`,
  });
  expect(isOk(result)).toBe(true);
}

async function liveQuotes(db: SqlDriver): Promise<string[]> {
  const listed = await listAnnotations(db, HASH);
  expect(isOk(listed)).toBe(true);
  return isOk(listed) ? listed.data.map((a) => a.quote).sort() : [];
}

async function syncUids(db: SqlDriver): Promise<string[]> {
  const listed = await listAnnotationsForSync(db, HASH);
  expect(isOk(listed)).toBe(true);
  return isOk(listed) ? listed.data.map((a) => a.uid ?? '').sort() : [];
}

describe('annotation identity', () => {
  it('stamps a new annotation with the uid the caller generated', async () => {
    const db = await createDevice();

    const created = await createAnnotation(db, HASH, highlight('one'), {
      generateUid: () => 'custom-uid',
    });

    expect(isOk(created) && created.data.uid).toBe('custom-uid');
    const listed = await listAnnotations(db, HASH);
    expect(isOk(listed) && listed.data[0].uid).toBe('custom-uid');
  });

  it('refuses two annotations with the same uid in one book but allows it across books', async () => {
    const db = await createDevice();
    await upsertFile(db, { filePath: '/other.pdf', hash: 'other-hash', title: 'Other' });
    const options = { generateUid: () => 'same' };

    expect(isOk(await createAnnotation(db, HASH, highlight('one'), options))).toBe(true);
    expect(isOk(await createAnnotation(db, HASH, highlight('two'), options))).toBe(false);
    expect(isOk(await createAnnotation(db, 'other-hash', highlight('three'), options))).toBe(true);
  });

  it('derives the same identity for the same book and old id, and different ones otherwise', () => {
    expect(deriveAnnotationUid('h', 1)).toBe(deriveAnnotationUid('h', 1));
    expect(deriveAnnotationUid('h', 1)).not.toBe(deriveAnnotationUid('h', 2));
    expect(deriveAnnotationUid('h', 1)).not.toBe(deriveAnnotationUid('g', 1));
    expect(deriveAnnotationUid('h', 1)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('two devices that create annotations while offline', () => {
  it('both keep every annotation after syncing, even though their local ids collide', async () => {
    const remote = createMemoryStorage();
    const deviceA = await createDevice();
    const deviceB = await createDevice();
    await syncDevice(deviceA, remote);
    await syncDevice(deviceB, remote);

    const a = await createAnnotation(deviceA, HASH, highlight('written on A'), {
      generateUid: sequentialUids('a'),
      stamp: { updatedAt: 1000, updatedBy: 'dev-a' },
    });
    const b = await createAnnotation(deviceB, HASH, highlight('written on B'), {
      generateUid: sequentialUids('b'),
      stamp: { updatedAt: 1001, updatedBy: 'dev-b' },
    });
    expect(isOk(a) && isOk(b) && a.data.id === b.data.id).toBe(true);

    await syncDevice(deviceA, remote);
    await syncDevice(deviceB, remote);
    await syncDevice(deviceA, remote);

    expect(await liveQuotes(deviceA)).toEqual(['written on A', 'written on B']);
    expect(await liveQuotes(deviceB)).toEqual(['written on A', 'written on B']);
  });

  it('keeps several annotations per device without duplicating any on repeated syncs', async () => {
    const remote = createMemoryStorage();
    const deviceA = await createDevice();
    const deviceB = await createDevice();
    const uidsA = sequentialUids('a');
    const uidsB = sequentialUids('b');
    for (const quote of ['a1', 'a2']) {
      await createAnnotation(deviceA, HASH, highlight(quote), { generateUid: uidsA });
    }
    for (const quote of ['b1', 'b2']) {
      await createAnnotation(deviceB, HASH, highlight(quote), { generateUid: uidsB });
    }

    for (const device of [deviceA, deviceB, deviceA, deviceB, deviceA]) {
      await syncDevice(device, remote);
    }

    expect(await liveQuotes(deviceA)).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(await liveQuotes(deviceB)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });
});

describe('annotations that predate identity', () => {
  it('are backfilled with the same deterministic uid on every device', async () => {
    const rows = [
      { id: 1, quote: 'first' },
      { id: 2, quote: 'second' },
    ];
    const deviceA = await createLegacyDevice(rows);
    const deviceB = await createLegacyDevice(rows);

    const expected = [deriveAnnotationUid(HASH, 1), deriveAnnotationUid(HASH, 2)].sort();
    expect(await syncUids(deviceA)).toEqual(expected);
    expect(await syncUids(deviceB)).toEqual(expected);
  });

  it('do not duplicate when two devices upgrade separately and then sync', async () => {
    const rows = [
      { id: 1, quote: 'first' },
      { id: 2, quote: 'second' },
    ];
    const remote = createMemoryStorage();
    const deviceA = await createLegacyDevice(rows);
    const deviceB = await createLegacyDevice(rows);

    for (const device of [deviceA, deviceB, deviceA, deviceB]) {
      await syncDevice(device, remote);
    }

    expect(await liveQuotes(deviceA)).toEqual(['first', 'second']);
    expect(await liveQuotes(deviceB)).toEqual(['first', 'second']);
  });

  it('are backfilled without losing or changing any data', async () => {
    const db = createMemoryDriver();
    await db.exec(filesSchema());
    await db.exec(LEGACY_ANNOTATIONS_DDL);
    await upsertFile(db, { filePath: '/book.pdf', hash: HASH, title: 'Book' });
    await db.run(
      `INSERT INTO annotations (id, file_hash, page, page_start, page_end, quote, color, note,
         para_index, para_start, para_end, created_at, updated_at, updated_by, deleted_at)
       VALUES (7, ?, 4, 10, 20, 'kept quote', 'pink', 'kept note', 2, 3, 9, '2024-01-02 03:04:05', 777, 'dev-x', NULL),
              (8, ?, 5, NULL, NULL, 'gone', 'blue', NULL, NULL, NULL, NULL, '2024-01-02 03:04:05', 888, 'dev-y', 888)`,
      [HASH, HASH],
    );

    expect(isOk(await migrateAnnotationsSchema(db))).toBe(true);

    const live = await listAnnotations(db, HASH);
    expect(isOk(live)).toBe(true);
    if (isOk(live)) {
      expect(live.data).toEqual([
        {
          id: 7,
          uid: deriveAnnotationUid(HASH, 7),
          fileHash: HASH,
          page: 4,
          pageStart: 10,
          pageEnd: 20,
          quote: 'kept quote',
          color: 'pink',
          note: 'kept note',
          paraIndex: 2,
          paraStart: 3,
          paraEnd: 9,
          createdAt: '2024-01-02 03:04:05',
          updatedAt: 777,
          updatedBy: 'dev-x',
        },
      ]);
    }
    const synced = await listAnnotationsForSync(db, HASH);
    expect(isOk(synced)).toBe(true);
    if (isOk(synced)) {
      const tombstone = synced.data.find((a) => a.id === 8);
      expect(tombstone?.deleted).toBe(true);
      expect(tombstone?.uid).toBe(deriveAnnotationUid(HASH, 8));
      expect(tombstone?.updatedAt).toBe(888);
    }
  });

  it('keep their uid when the upgrade runs again', async () => {
    const db = await createLegacyDevice([{ id: 1, quote: 'first' }]);
    const before = await syncUids(db);

    expect(isOk(await migrateAnnotationsSchema(db))).toBe(true);
    await createAnnotation(db, HASH, highlight('later'), { generateUid: () => 'fresh' });

    expect(await syncUids(db)).toEqual([...before, 'fresh'].sort());
  });

  it('merge with a manifest written by an older build that has no uids', async () => {
    const remote = createMemoryStorage();
    const legacyManifest = {
      version: 1,
      records: [
        {
          hash: HASH,
          title: 'Book',
          status: 'unread',
          tags: [],
          updatedAt: 10,
          updatedBy: 'old-device',
          deleted: false,
          annotations: [
            {
              id: 1,
              page: 1,
              pageStart: 0,
              pageEnd: 5,
              quote: 'first',
              color: 'yellow',
              note: 'older note',
              paraIndex: null,
              paraStart: null,
              paraEnd: null,
              updatedAt: 60,
              updatedBy: 'old-device',
              deleted: false,
            },
          ],
        },
      ],
    };
    await remote.writeFile('manifest.json', utf8Encode(JSON.stringify(legacyManifest)));
    const upgraded = await createLegacyDevice([{ id: 1, quote: 'first' }]);
    const fresh = await createDevice();
    await fresh.run('DELETE FROM annotations');

    await syncDevice(upgraded, remote);
    await syncDevice(fresh, remote);

    expect(await liveQuotes(upgraded)).toEqual(['first']);
    expect(await liveQuotes(fresh)).toEqual(['first']);
    const listed = await listAnnotations(upgraded, HASH);
    expect(isOk(listed) && listed.data[0].note).toBe('older note');
    expect(await syncUids(fresh)).toEqual([deriveAnnotationUid(HASH, 1)]);
  });
});

describe('manifest compatibility', () => {
  it('stays at version 1 and keeps every field an older build validates, including the numeric id', async () => {
    const remote = createMemoryStorage();
    const db = await createDevice();
    await createAnnotation(db, HASH, highlight('kept'), { generateUid: () => 'uid-1' });

    await syncDevice(db, remote);

    const read = await remote.readFile('manifest.json');
    const raw = read.ok ? read.data : null;
    expect(raw).not.toBeNull();
    const manifest = JSON.parse(utf8Decode(raw ?? new Uint8Array())) as {
      version: number;
      records: { annotations: Record<string, unknown>[] }[];
    };
    expect(manifest.version).toBe(1);
    const annotation = manifest.records[0].annotations[0];
    expect(annotation.uid).toBe('uid-1');
    expect(typeof annotation.id).toBe('number');
    expect(annotation).toMatchObject({
      page: 1,
      quote: 'kept',
      color: 'yellow',
      updatedBy: '',
      deleted: false,
    });
    expect(typeof annotation.updatedAt).toBe('number');
    expect(acceptedByOlderBuild(annotation)).toBe(true);
  });

  it('parses annotation records with and without a uid', () => {
    const base = {
      id: 3,
      page: 1,
      pageStart: null,
      pageEnd: null,
      quote: 'q',
      color: 'green',
      note: null,
      paraIndex: null,
      paraStart: null,
      paraEnd: null,
      updatedAt: 1,
      updatedBy: 'd',
      deleted: false,
    };
    const record = { hash: 'h', title: 't', status: 'unread', tags: [], updatedAt: 1, updatedBy: 'd', deleted: false };
    const raw = JSON.stringify({
      version: 1,
      records: [{ ...record, annotations: [base, { ...base, id: 4, uid: 'given' }] }],
    });

    const parsed = parseManifest(raw);

    expect(parsed?.records[0].annotations.map((a) => a.uid)).toEqual([deriveAnnotationUid('h', 3), 'given']);
  });

  it('rejects a record whose uid is not a string', () => {
    const record = {
      hash: 'h',
      title: 't',
      status: 'unread',
      tags: [],
      updatedAt: 1,
      updatedBy: 'd',
      deleted: false,
      annotations: [
        {
          id: 1, uid: 42, page: 1, quote: 'q', color: 'green', updatedAt: 1, updatedBy: 'd', deleted: false,
        },
      ],
    };

    expect(parseManifest(JSON.stringify({ version: 1, records: [record] }))?.records).toEqual([]);
  });
});

describe('last-write-wins per annotation identity', () => {
  async function deviceWith(uid: string, stamp: { updatedAt: number; updatedBy: string }): Promise<SqlDriver> {
    const db = await createDevice();
    const created = await createAnnotation(db, HASH, highlight('quote'), { generateUid: () => uid, stamp });
    expect(isOk(created)).toBe(true);
    return db;
  }

  it('matches by uid, not by the local id', async () => {
    const db = await deviceWith('u1', { updatedAt: 100, updatedBy: 'dev-a' });

    await applyRecordAnnotations(db, HASH, [
      remoteAnnotation({ id: 1, uid: 'someone-else', quote: 'different annotation', updatedAt: 999 }),
      remoteAnnotation({ id: 55, uid: 'u1', note: 'edited elsewhere', updatedAt: 200 }),
    ]);

    const listed = await listAnnotations(db, HASH);
    expect(isOk(listed)).toBe(true);
    if (isOk(listed)) {
      expect(listed.data.map((a) => [a.uid, a.quote, a.note])).toEqual([
        ['u1', 'quote', 'edited elsewhere'],
        ['someone-else', 'different annotation', null],
      ]);
      expect(listed.data[0].id).toBe(1);
    }
  });

  it('lets a newer edit beat an older delete', async () => {
    const db = await deviceWith('u1', { updatedAt: 100, updatedBy: 'dev-a' });
    const local = await listAnnotations(db, HASH);
    if (isOk(local)) await deleteAnnotation(db, local.data[0].id, { updatedAt: 200, updatedBy: 'dev-a' });

    await applyRecordAnnotations(db, HASH, [remoteAnnotation({ id: 9, note: 'edited later', updatedAt: 300 })]);

    const listed = await listAnnotations(db, HASH);
    expect(isOk(listed) && listed.data.map((a) => a.note)).toEqual(['edited later']);
  });

  it('lets a newer delete beat an older edit', async () => {
    const db = await deviceWith('u1', { updatedAt: 100, updatedBy: 'dev-a' });
    const local = await listAnnotations(db, HASH);
    if (isOk(local)) await setAnnotationNote(db, local.data[0].id, 'edited', { updatedAt: 200, updatedBy: 'dev-a' });

    await applyRecordAnnotations(db, HASH, [remoteAnnotation({ id: 9, deleted: true, updatedAt: 300 })]);

    expect(await liveQuotes(db)).toEqual([]);
  });

  it('keeps a newer local edit over an older remote one and an older local delete over nothing', async () => {
    const db = await deviceWith('u1', { updatedAt: 500, updatedBy: 'dev-a' });

    await applyRecordAnnotations(db, HASH, [remoteAnnotation({ note: 'stale', updatedAt: 300 })]);

    const listed = await listAnnotations(db, HASH);
    expect(isOk(listed) && listed.data[0].note).toBeNull();
  });

  it('resolves an edit on one device against a delete on another through a sync', async () => {
    const remote = createMemoryStorage();
    const deviceA = await createDevice();
    const deviceB = await createDevice();
    const created = await createAnnotation(deviceA, HASH, highlight('shared'), {
      generateUid: () => 'shared-uid',
      stamp: { updatedAt: 100, updatedBy: 'dev-a' },
    });
    expect(isOk(created)).toBe(true);
    await syncDevice(deviceA, remote);
    await syncDevice(deviceB, remote);
    expect(await liveQuotes(deviceB)).toEqual(['shared']);

    const onA = await listAnnotations(deviceA, HASH);
    const onB = await listAnnotations(deviceB, HASH);
    if (isOk(onA)) await setAnnotationNote(deviceA, onA.data[0].id, 'newer edit', { updatedAt: 300, updatedBy: 'dev-a' });
    if (isOk(onB)) await deleteAnnotation(deviceB, onB.data[0].id, { updatedAt: 200, updatedBy: 'dev-b' });

    for (const device of [deviceB, deviceA, deviceB]) await syncDevice(device, remote);

    for (const device of [deviceA, deviceB]) {
      const listed = await listAnnotations(device, HASH);
      expect(isOk(listed) && listed.data.map((a) => a.note)).toEqual(['newer edit']);
    }
  });
});

describe('applying merged records', () => {
  it('stores a remote annotation even when the book record itself is unchanged', async () => {
    const db = await createDevice();
    const listed = await listRecordsForSync(db);
    expect(isOk(listed)).toBe(true);
    if (!isOk(listed)) return;
    const unchanged = { ...listed.data[0], annotations: [remoteAnnotation({ uid: 'only-remote', quote: 'from remote' })] };

    const applied = await applySyncRecords(db, [unchanged], (hash) => `/blobs/${hash}`);

    expect(isOk(applied) && applied.data).toEqual({ added: 0, updated: 0, deleted: 0 });
    expect(await liveQuotes(db)).toEqual(['from remote']);
  });
});
