import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAnnotationService,
  isErr,
  isOk,
  startDatabase,
  upsertFile,
  type Annotation,
  type AnnotationService,
  type Result,
  type SqlDriver,
} from '../src';
import { createMemoryDriver } from './helpers';

function unwrap<T>(result: Result<T>): T {
  if (!isOk(result)) throw new Error(result.error);
  return result.data;
}

const ANCHOR = { pageStart: null, pageEnd: null, paraIndex: null, paraStart: null, paraEnd: null };

describe('createAnnotationService', () => {
  let db: SqlDriver;
  let service: AnnotationService;
  let uidCounter: number;
  let clock: number;

  beforeEach(async () => {
    db = createMemoryDriver();
    await startDatabase(db);
    unwrap(await upsertFile(db, { hash: 'h1', title: 'One', filePath: '/1.pdf' }));
    unwrap(await upsertFile(db, { hash: 'h2', title: 'Two', filePath: '/2.pdf' }));
    uidCounter = 0;
    clock = 1000;
    service = createAnnotationService(db, {
      getDeviceId: async () => 'device-a',
      generateUid: () => `uid-${++uidCounter}`,
      now: () => clock,
    });
  });

  async function highlight(fileHash = 'h1'): Promise<Annotation> {
    return unwrap(await service.create(fileHash, { ...ANCHOR, page: 2, quote: 'quoted text', color: 'yellow', note: null }));
  }

  it('creates a Highlight stamped with the device and generated uid', async () => {
    const created = await highlight();
    expect(created.uid).toBe('uid-1');
    expect(created.updatedBy).toBe('device-a');
    expect(created.updatedAt).toBe(1000);
    expect(unwrap(await service.list('h1'))).toHaveLength(1);
  });

  it('lists only the requested book, and every book in the library list', async () => {
    await highlight('h1');
    await highlight('h2');
    expect(unwrap(await service.list('h1'))).toHaveLength(1);
    expect(unwrap(await service.listLibrary())).toHaveLength(2);
  });

  it('changes the Highlight color with a fresh stamp', async () => {
    const created = await highlight();
    clock = 2000;
    const updated = unwrap(await service.setColor(created.id, 'green'));
    expect(updated.color).toBe('green');
    expect(updated.updatedAt).toBe(2000);
  });

  it('saves, then deletes, Note text on a Highlight', async () => {
    const created = await highlight();
    expect(unwrap(await service.saveNote(created.id, '  my note ')).note).toBe('my note');
    expect(unwrap(await service.deleteNote(created.id))?.note).toBeNull();
  });

  it('saves a Page note and removes it entirely when its Note is deleted', async () => {
    const page = unwrap(await service.savePageNote('h1', { page: 3, text: 'page thought' }));
    expect(page.note).toBe('page thought');
    expect(unwrap(await service.deleteNote(page.id))).toBeNull();
    expect(unwrap(await service.list('h1'))).toHaveLength(0);
  });

  it('rejects an empty Page note', async () => {
    expect(isErr(await service.savePageNote('h1', { page: 3, text: '   ' }))).toBe(true);
  });

  it('saves a Note draft as a Highlight with a Note', async () => {
    const draft = unwrap(
      await service.saveDraft('h1', { ...ANCHOR, page: 1, quote: 'passage', color: 'blue', text: 'draft text' }),
    );
    expect(draft.note).toBe('draft text');
    expect(draft.quote).toBe('passage');
  });

  it('records a page anchor and a reflow anchor', async () => {
    const created = await highlight();
    clock = 2000;
    const anchored = unwrap(await service.setPageAnchor(created.id, { pageStart: 4, pageEnd: 9 }));
    expect(anchored.pageStart).toBe(4);
    expect(anchored.updatedAt).toBe(1000);
    const reflowed = unwrap(
      await service.setReflowAnchor(created.id, { paraIndex: 1, paraStart: 2, paraEnd: 5 }),
    );
    expect(reflowed.paraIndex).toBe(1);
  });

  it('deletes an annotation from the lists', async () => {
    const created = await highlight();
    unwrap(await service.delete(created.id));
    expect(unwrap(await service.list('h1'))).toHaveLength(0);
    expect(unwrap(await service.listLibrary())).toHaveLength(0);
  });
});
