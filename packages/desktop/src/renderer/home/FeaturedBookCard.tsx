import type { ReactElement } from 'react';
import { formatLastRead, type FeaturedBook } from '@taking-book/core';
import type { BookFile } from '../../shared/types';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { initials } from '@/lib/initials';
import { progressLine, readingProgressPercent } from '@/lib/progress';

interface FeaturedBookCardProps {
  featured: FeaturedBook;
  busy: boolean;
  onOpen: (file: BookFile) => void;
}

/**
 * The Featured book card: a Book being read offered as "Continue reading" with
 * its progress, or an unstarted Book offered as "Start reading" with none.
 * The card is only as tall as its cover.
 */
export function FeaturedBookCard({ featured, busy, onOpen }: FeaturedBookCardProps): ReactElement {
  const { book, kind } = featured;
  return (
    <Card className="group transition-all hover:border-ink/25 hover:shadow-md">
      <CardContent
        className="flex cursor-pointer flex-col items-start gap-6 p-6 md:flex-row"
        onClick={() => onOpen(book)}
      >
        <BookCover
          key={book.id}
          file={book}
          className="bg-ink text-card h-67.5 w-45 shrink-0 rounded-md transition-transform duration-200 group-hover:scale-[1.02]"
          fallback={<span className="text-3xl font-semibold">{initials(book.title)}</span>}
        />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-3">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight group-hover:underline">
            {book.title}
          </h2>
          {kind === 'continue' && <ReadingProgress book={book} />}
          <Button
            className="mt-1"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(book);
            }}
            disabled={busy}
          >
            {kind === 'continue' ? 'Continue reading' : 'Start reading'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// A Book marked as reading by hand may never have been opened, so each line
// shows only when there is something true to say.
function ReadingProgress({ book }: { book: BookFile }): ReactElement {
  const line = progressLine(book);
  const percent = readingProgressPercent(book);
  return (
    <div className="text-muted-foreground flex w-full max-w-72 flex-col gap-2 text-sm">
      {line && <span className="tabular-nums">{line}</span>}
      {percent != null && (
        <Progress value={percent} aria-label={`Reading progress for ${book.title}`} />
      )}
      {book.lastReadAt != null && <span>{formatLastRead(book.lastReadAt, Date.now())}</span>}
    </div>
  );
}
