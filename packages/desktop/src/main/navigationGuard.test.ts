import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { guardAgainstNavigation } from './navigationGuard';

function navigate(contents: EventEmitter, url: string): { preventDefault: () => void } {
  const event = { preventDefault: vi.fn() };
  contents.emit('will-navigate', event, url);
  return event;
}

describe('guardAgainstNavigation', () => {
  it.each([
    'file:///home/reader/book.pdf',
    'file:///home/reader/books/',
    'file:///home/reader/notes.txt',
    'https://example.com/',
  ])('cancels navigation to %s', (url) => {
    const contents = new EventEmitter();
    guardAgainstNavigation(contents, { logWarning: () => undefined });

    expect(navigate(contents, url).preventDefault).toHaveBeenCalled();
  });

  it('logs the blocked URL so an unexpected block can be traced', () => {
    const contents = new EventEmitter();
    const logWarning = vi.fn();
    guardAgainstNavigation(contents, { logWarning });

    navigate(contents, 'file:///home/reader/book.pdf');

    expect(logWarning).toHaveBeenCalledWith(expect.stringContaining('file:///home/reader/book.pdf'));
  });
});
