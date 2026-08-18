import { describe, expect, it } from 'vitest';
import { isNewerThan, mergeRecords, pickWinner } from '../src/sync/merge';
import type { SyncRecord } from '../src/sync/types';

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
