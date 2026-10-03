import type { BookMinutes } from '@/reader-api';
import { formatDuration } from './chartAxes';

interface BookReadingListProps {
  books: BookMinutes[];
}

/**
 * Lists each book read in the stats window with its total reading time. A thin
 * bar under every row shows its share relative to the most-read book, so the
 * ranking is readable at a glance. Expects `books` most-read first.
 */
export function BookReadingList({ books }: BookReadingListProps) {
  if (books.length === 0) {
    return <p className="text-muted-foreground text-sm">No books read in this period.</p>;
  }
  const maxMinutes = books[0].minutes;

  return (
    <ul className="flex flex-col gap-3">
      {books.map((book) => (
        <li key={book.fileId} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate text-sm font-medium">{book.title}</span>
            <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
              {formatDuration(book.minutes)}
            </span>
          </div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${(book.minutes / maxMinutes) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
