import { describe, expect, it } from 'vitest';
import { findNearestNote, locateNote } from '../src';
import type { Annotation } from '../src';

let nextId = 1;

function note(overrides: Partial<Annotation> = {}): Annotation {
  const id = nextId++;
  return {
    id,
    uid: `uid-${id}`,
    fileHash: 'h1',
    page: 1,
    pageStart: 0,
    pageEnd: 5,
    quote: 'quoted',
    color: 'yellow',
    note: 'a thought',
    paraIndex: 0,
    paraStart: 0,
    paraEnd: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: 0,
    updatedBy: 'device',
    ...overrides,
  };
}

describe('locateNote', () => {
  it('finds a passage in page mode when the page-text anchor exists', () => {
    expect(locateNote(note({ pageStart: 3, pageEnd: 9 }), 'page')).toBe('passage');
  });

  it('finds a passage in reflow mode when the paragraph anchor exists', () => {
    expect(locateNote(note({ paraIndex: 2, paraStart: 1, paraEnd: 4 }), 'reflow')).toBe('passage');
  });

  it('finds a note made in reflow in page mode when the page anchor was matched at creation', () => {
    const madeInReflow = note({ pageStart: 40, pageEnd: 60, paraIndex: 7, paraStart: 0, paraEnd: 20 });

    expect(locateNote(madeInReflow, 'page')).toBe('passage');
  });

  it('loses the passage in page mode when only the reflow anchor exists', () => {
    const reflowOnly = note({ pageStart: null, pageEnd: null });

    expect(locateNote(reflowOnly, 'page')).toBe('lost');
    expect(locateNote(reflowOnly, 'reflow')).toBe('passage');
  });

  it('loses the passage in reflow mode when only the page anchor exists', () => {
    const pageOnly = note({ paraIndex: null, paraStart: null, paraEnd: null });

    expect(locateNote(pageOnly, 'reflow')).toBe('lost');
    expect(locateNote(pageOnly, 'page')).toBe('passage');
  });

  it('treats a half-set anchor as missing', () => {
    expect(locateNote(note({ pageStart: 3, pageEnd: null }), 'page')).toBe('lost');
    expect(locateNote(note({ paraIndex: 1, paraStart: null, paraEnd: 4 }), 'reflow')).toBe('lost');
  });

  it('only asks for the page when the note has no quoted passage, in either mode', () => {
    const pageNote = note({ quote: '', pageStart: null, pageEnd: null, paraIndex: null, paraStart: null, paraEnd: null });

    expect(locateNote(pageNote, 'page')).toBe('page');
    expect(locateNote(pageNote, 'reflow')).toBe('page');
  });

  it('treats a whitespace-only quote as no passage', () => {
    expect(locateNote(note({ quote: ' \n ', pageStart: null, pageEnd: null }), 'page')).toBe('page');
  });
});

describe('findNearestNote', () => {
  it('returns null for a book with no notes', () => {
    expect(findNearestNote([], 5)).toBeNull();
  });

  it('returns the only note whatever the position', () => {
    const only = note({ page: 40 });

    expect(findNearestNote([only], 1)).toBe(only);
    expect(findNearestNote([only], 400)).toBe(only);
  });

  it('picks the note on the reading page itself', () => {
    const before = note({ page: 4 });
    const here = note({ page: 5 });
    const after = note({ page: 6 });

    expect(findNearestNote([before, here, after], 5)).toBe(here);
  });

  it('picks the closest note before the position when that one is nearer', () => {
    const far = note({ page: 1 });
    const near = note({ page: 9 });
    const later = note({ page: 30 });

    expect(findNearestNote([far, near, later], 10)).toBe(near);
  });

  it('picks the closest note after the position when that one is nearer', () => {
    const early = note({ page: 1 });
    const near = note({ page: 12 });
    const late = note({ page: 30 });

    expect(findNearestNote([early, near, late], 10)).toBe(near);
  });

  it('picks the note above the reading spot when one is as near before as after', () => {
    const before = note({ page: 3 });
    const after = note({ page: 7 });

    expect(findNearestNote([before, after], 5)).toBe(before);
  });

  it('picks the first note in reading order among several on the nearest page', () => {
    const top = note({ page: 6, pageStart: 5 });
    const bottom = note({ page: 6, pageStart: 900 });

    expect(findNearestNote([top, bottom], 6)).toBe(top);
  });

  it('is not thrown off by a position before the first or after the last note', () => {
    const first = note({ page: 10 });
    const last = note({ page: 20 });

    expect(findNearestNote([first, last], 1)).toBe(first);
    expect(findNearestNote([first, last], 300)).toBe(last);
  });
});
