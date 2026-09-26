import { describe, expect, it } from 'vitest';
import { createFileDragTracker, getDroppedFilePaths } from './file-drag';

const FILES = ['Files'];

describe('createFileDragTracker', () => {
  it('shows the overlay when files are dragged into the window', () => {
    const tracker = createFileDragTracker();
    expect(tracker.enter(FILES)).toBe(true);
  });

  it('ignores drags that carry no files, such as selected text', () => {
    const tracker = createFileDragTracker();
    expect(tracker.enter(['text/plain', 'text/html'])).toBe(false);
    expect(tracker.leave(['text/plain', 'text/html'])).toBe(false);
  });

  it('keeps the overlay while the drag moves between child elements', () => {
    const tracker = createFileDragTracker();
    tracker.enter(FILES);
    // Moving onto a child fires enter on the child before leave on the parent.
    tracker.enter(FILES);
    expect(tracker.leave(FILES)).toBe(true);
  });

  it('hides the overlay once the drag leaves the window', () => {
    const tracker = createFileDragTracker();
    tracker.enter(FILES);
    tracker.enter(FILES);
    tracker.leave(FILES);
    expect(tracker.leave(FILES)).toBe(false);
  });

  it('hides the overlay on drop, however deep the drag had gone', () => {
    const tracker = createFileDragTracker();
    tracker.enter(FILES);
    tracker.enter(FILES);
    expect(tracker.drop()).toBe(false);
  });

  it('starts afresh after a drop, so the next drag shows and hides the overlay again', () => {
    const tracker = createFileDragTracker();
    tracker.enter(FILES);
    tracker.enter(FILES);
    tracker.drop();
    expect(tracker.enter(FILES)).toBe(true);
    expect(tracker.leave(FILES)).toBe(false);
  });

  it('never counts below zero when a leave arrives without its enter', () => {
    const tracker = createFileDragTracker();
    tracker.leave(FILES);
    expect(tracker.enter(FILES)).toBe(true);
    expect(tracker.leave(FILES)).toBe(false);
  });
});

describe('getDroppedFilePaths', () => {
  const file = (name: string): File => new File([], name);

  it('returns the path of each dropped file, in drop order', () => {
    const paths = getDroppedFilePaths([file('a.pdf'), file('b.txt')], (f) => `/books/${f.name}`);
    expect(paths).toEqual(['/books/a.pdf', '/books/b.txt']);
  });

  it('leaves out files with no path on disk', () => {
    const paths = getDroppedFilePaths([file('a.pdf'), file('virtual.pdf')], (f) => (f.name === 'a.pdf' ? '/books/a.pdf' : ''));
    expect(paths).toEqual(['/books/a.pdf']);
  });
});
