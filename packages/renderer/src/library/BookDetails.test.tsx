import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { BookFile } from '@/reader-api';
import { installFakeCapabilities } from '@/lib/fake-capabilities';
import { BookDetails } from './BookDetails';

const BOOK: BookFile = {
  id: 1,
  hash: 'abc',
  path: '/tmp/b.pdf',
  title: 'Deep Work',
  status: 'reading',
  tags: ['focus', 'work'],
  favorite: true,
  lastPage: 50,
  lastPosition: 0,
  lastMode: 'page',
  pageCount: 200,
  zoom: null,
  reflowZoom: null,
  lastReadAt: null,
  createdAt: '2026-01-01 00:00:00',
};

const noop = (): void => undefined;

function renderDetails(overrides: { onQuiz?: (() => void) | null; onClose?: () => void; file?: BookFile } = {}): string {
  return renderToStaticMarkup(
    <BookDetails
      file={overrides.file ?? BOOK}
      onOpen={noop}
      onSetStatus={noop}
      onSetTags={noop}
      onToggleFavorite={noop}
      onRename={noop}
      onRemove={noop}
      onQuiz={overrides.onQuiz ?? null}
      onClose={overrides.onClose}
    />,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('BookDetails', () => {
  it('shows the title, progress, status, tags and favorite mark with Open and remove', () => {
    installFakeCapabilities();
    const html = renderDetails();
    expect(html).toContain('Deep Work');
    expect(html).toContain('Page 50 of 200');
    expect(html).toContain('aria-label="Status for Deep Work"');
    expect(html).toContain('focus');
    expect(html).toContain('aria-label="Remove tag work"');
    expect(html).toContain('aria-label="Remove Deep Work from favorites"');
    expect(html).toContain('aria-label="Open Deep Work"');
    expect(html).toContain('aria-label="Remove Deep Work from library"');
  });

  it('offers the Quiz action only when the platform provides one', () => {
    installFakeCapabilities();
    expect(renderDetails({ onQuiz: null })).not.toContain('Take a Quiz');
    expect(renderDetails({ onQuiz: noop })).toContain('aria-label="Take a Quiz on Deep Work"');
  });

  it('hides the Quiz action for a Book that was never read', () => {
    installFakeCapabilities();
    expect(renderDetails({ onQuiz: noop, file: { ...BOOK, lastPage: null } })).not.toContain('Take a Quiz');
  });

  it('shows a close control only in a pane', () => {
    installFakeCapabilities();
    expect(renderDetails()).not.toContain('Close details');
    expect(renderDetails({ onClose: noop })).toContain('aria-label="Close details"');
  });
});
