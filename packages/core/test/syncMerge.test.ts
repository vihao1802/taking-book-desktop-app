import { describe, expect, it } from 'vitest';
import { deriveAnnotationUid, resolveAnnotationUid } from '../src/annotationUid';
import { isNewerThan, mergeAnnotations, mergeRecords, pickWinner } from '../src/sync/merge';
import type { SyncAnnotation, SyncRecord } from '../src/sync/types';

function record(hash: string, updatedAt: number, updatedBy: string, deleted = false): SyncRecord {
  return {
    hash,
    title: 'T',
    status: 'unread',
    tags: [],
    lastPage: null,
    lastPosition: null,
    annotations: [],
    updatedAt,
    updatedBy,
    deleted,
  };
}

describe('mergeRecords', () => {
  it('keeps records that exist on only one side', () => {
    const merged = mergeRecords([record('a', 10, 'dev-a')], [record('b', 20, 'dev-b')]);
    expect(merged.map((r) => r.hash).sort()).toEqual(['a', 'b']);
  });

  it('picks the higher updatedAt for a conflicting hash', () => {
    const merged = mergeRecords([record('a', 10, 'dev-a')], [record('a', 20, 'dev-b')]);
    expect(merged).toHaveLength(1);
    expect(merged[0].updatedAt).toBe(20);
    expect(merged[0].updatedBy).toBe('dev-b');
  });

  it('breaks timestamp ties deterministically by device id', () => {
    const merged = mergeRecords([record('a', 100, 'dev-a')], [record('a', 100, 'dev-b')]);
    expect(merged[0].updatedBy).toBe('dev-b');

    const reversed = mergeRecords([record('a', 100, 'dev-b')], [record('a', 100, 'dev-a')]);
    expect(reversed[0].updatedBy).toBe('dev-b');
  });

  it('a newer tombstone deletes an older live record', () => {
    const merged = mergeRecords(
      [record('a', 10, 'dev-a')],
      [record('a', 30, 'dev-b', true)],
    );
    expect(merged[0].deleted).toBe(true);
  });

  it('a newer live record resurrects an older tombstone', () => {
    const merged = mergeRecords(
      [record('a', 50, 'dev-a', true)],
      [record('a', 60, 'dev-b')],
    );
    expect(merged[0].deleted).toBe(false);
  });

  it('an identical record keeps the local copy', () => {
    const local = record('a', 5, 'dev-a');
    const merged = mergeRecords([local], [record('a', 5, 'dev-a')]);
    expect(merged[0]).toBe(local);
  });
});

describe('pickWinner', () => {
  it('returns the strictly newer record', () => {
    const a = record('x', 1, 'dev-a');
    const b = record('x', 2, 'dev-b');
    expect(pickWinner(a, b)).toBe(b);
  });

  it('returns local on exact equality', () => {
    const a = record('x', 1, 'dev-a');
    const b = record('x', 1, 'dev-a');
    expect(pickWinner(a, b)).toBe(a);
  });
});

describe('isNewerThan', () => {
  it('compares timestamps first', () => {
    expect(isNewerThan({ updatedAt: 5, updatedBy: 'a' }, { updatedAt: 4, updatedBy: 'z' })).toBe(true);
  });

  it('falls back to device id on equal timestamps', () => {
    expect(isNewerThan({ updatedAt: 5, updatedBy: 'z' }, { updatedAt: 5, updatedBy: 'a' })).toBe(true);
    expect(isNewerThan({ updatedAt: 5, updatedBy: 'a' }, { updatedAt: 5, updatedBy: 'z' })).toBe(false);
  });
});

function annotation(uid: string | undefined, updatedAt: number, overrides: Partial<SyncAnnotation> = {}): SyncAnnotation {
  return {
    id: 1,
    uid,
    page: 1,
    pageStart: null,
    pageEnd: null,
    quote: 'q',
    color: 'yellow',
    note: null,
    paraIndex: null,
    paraStart: null,
    paraEnd: null,
    updatedAt,
    updatedBy: 'dev-a',
    deleted: false,
    ...overrides,
  };
}

describe('mergeAnnotations', () => {
  it('keeps annotations that exist on only one side, even when their local ids collide', () => {
    const merged = mergeAnnotations('h', [annotation('a', 10, { id: 1 })], [annotation('b', 10, { id: 1 })]);
    expect(merged.map((a) => a.uid).sort()).toEqual(['a', 'b']);
  });

  it('keeps the newer version of one uid', () => {
    const merged = mergeAnnotations('h', [annotation('a', 10, { note: 'old' })], [annotation('a', 20, { note: 'new' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].note).toBe('new');
  });

  it('lets a newer tombstone beat an older edit and a newer edit beat an older tombstone', () => {
    const deleteWins = mergeAnnotations('h', [annotation('a', 10)], [annotation('a', 20, { deleted: true })]);
    expect(deleteWins[0].deleted).toBe(true);
    const editWins = mergeAnnotations('h', [annotation('a', 10, { deleted: true })], [annotation('a', 20, { note: 'back' })]);
    expect(editWins[0].deleted).toBe(false);
  });

  it('keeps the local version on an exact tie of clock and device', () => {
    const merged = mergeAnnotations('h', [annotation('a', 10, { note: 'local' })], [annotation('a', 10, { note: 'remote' })]);
    expect(merged[0].note).toBe('local');
  });

  it('lines up an annotation without a uid with the derived uid of the same book and id', () => {
    const derived = deriveAnnotationUid('h', 7);
    const merged = mergeAnnotations('h', [annotation(undefined, 10, { id: 7, note: 'old build' })], [annotation(derived, 20, { id: 3, note: 'new build' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ uid: derived, note: 'new build' });
  });
});

describe('mergeRecords annotations', () => {
  it('merges annotations from both sides even when the book record itself is identical', () => {
    const local = { ...record('a', 5, 'dev-a'), annotations: [annotation('x', 10)] };
    const remote = { ...record('a', 5, 'dev-a'), annotations: [annotation('y', 10)] };
    const merged = mergeRecords([local], [remote]);
    expect(merged[0].annotations.map((a) => a.uid).sort()).toEqual(['x', 'y']);
  });

  it('merges annotations from the losing record too', () => {
    const local = { ...record('a', 5, 'dev-a'), annotations: [annotation('x', 10)] };
    const remote = { ...record('a', 9, 'dev-b'), annotations: [annotation('y', 10)] };
    const merged = mergeRecords([local], [remote]);
    expect(merged[0].updatedAt).toBe(9);
    expect(merged[0].annotations.map((a) => a.uid).sort()).toEqual(['x', 'y']);
  });
});

describe('resolveAnnotationUid', () => {
  it('returns the uid an annotation already has', () => {
    expect(resolveAnnotationUid('h', { id: 1, uid: 'given' })).toBe('given');
  });

  it('derives one from the book and old id when there is none', () => {
    expect(resolveAnnotationUid('h', { id: 1 })).toBe(deriveAnnotationUid('h', 1));
    expect(resolveAnnotationUid('h', { id: 1, uid: null })).toBe(deriveAnnotationUid('h', 1));
  });
});
