import { describe, expect, it } from 'vitest';
import { emptyManifest, parseManifest, serializeManifest } from '../src/sync/manifest';
import type { SyncRecord } from '../src/sync/types';

function record(hash: string): SyncRecord {
  return {
    hash,
    title: 'Title',
    status: 'reading',
    tags: ['work'],
    lastPage: 3,
    lastPosition: 0.5,
    updatedAt: 123,
    updatedBy: 'dev-a',
    deleted: false,
  };
}

describe('serializeManifest / parseManifest', () => {
  it('round-trips a manifest', () => {
    const manifest = { version: 1 as const, records: [record('h1'), record('h2')] };
    const parsed = parseManifest(serializeManifest(manifest));
    expect(parsed).not.toBeNull();
    expect(parsed?.records).toEqual(manifest.records);
  });

  it('returns null for invalid JSON', () => {
    expect(parseManifest('{not json')).toBeNull();
  });

  it('returns null for a future version', () => {
    expect(parseManifest('{"version":2,"records":[]}')).toBeNull();
  });

  it('drops invalid records but keeps the valid ones', () => {
    const raw = JSON.stringify({
      version: 1,
      records: [
        { hash: 'bad', title: 42, status: 'unread', tags: [], updatedAt: 1, updatedBy: 'a', deleted: false },
        record('good'),
      ],
    });
    const parsed = parseManifest(raw);
    expect(parsed?.records.map((r) => r.hash)).toEqual(['good']);
  });

  it('emptyManifest is parseable and has no records', () => {
    const parsed = parseManifest(serializeManifest(emptyManifest()));
    expect(parsed?.records).toEqual([]);
  });
});
