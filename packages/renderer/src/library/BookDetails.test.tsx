import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { BookFile, RemoteOnlyBook } from '@/reader-api';
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

function renderDetails(overrides: { onQuiz?: (() => void) | null; onClose?: () => void; file?: BookFile; remoteOnly?: RemoteOnlyBook | null } = {}): string {
  return renderToStaticMarkup(
    <BookDetails
      file={overrides.file ?? BOOK}
      onOpen={noop}
      remoteOnly={overrides.remoteOnly ?? null}
      onDownloadNow={noop}
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

  describe('for a Book whose PDF is not on this device', () => {
    const networkReason: RemoteOnlyBook = { hash: 'abc', reason: 'network', message: 'PDFs download on Wi-Fi.', canDownloadNow: true };

    it('says why, offers Download now, and gives way from Open', () => {
      installFakeCapabilities();
      const html = renderDetails({ remoteOnly: networkReason });

      expect(html).toContain('Not on this device');
      expect(html).toContain('PDFs download on Wi-Fi.');
      expect(html).toContain('Download now');
      expect(html).not.toContain('Open Deep Work');
    });

    it('tells the reader to use desktop for a PDF that is too large, without a Download now', () => {
      installFakeCapabilities();
      const html = renderDetails({ remoteOnly: { hash: 'abc', reason: 'size', message: 'Read it on desktop.', canDownloadNow: false } });

      expect(html).toContain('Read it on desktop.');
      expect(html).not.toContain('Download now');
    });

    it('still shows the Book details, such as its title and Remove', () => {
      installFakeCapabilities();
      const html = renderDetails({ remoteOnly: networkReason });

      expect(html).toContain('Deep Work');
      expect(html).toContain('Remove Deep Work from library');
    });
  });
});
