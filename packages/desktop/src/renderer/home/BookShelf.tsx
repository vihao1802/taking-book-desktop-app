import type { ReactElement, ReactNode } from 'react';
import type { BookFile } from '../../shared/types';
import { Badge } from '@/components/ui/badge';
import { BookCover } from '@/components/BookCover';
import { Progress } from '@/components/ui/progress';
import { initials } from '@/lib/initials';
import { readingProgressPercent } from '@/lib/progress';
import { statusBadgeVariant, statusLabel } from '@/lib/status';

const AVATAR_COLORS = ['bg-avatar-a', 'bg-avatar-b'];

interface BookShelfProps {
  title: ReactNode;
  /** Shown at the end of the title row, e.g. a "Browse more" link. */
  action?: ReactNode;
  books: BookFile[];
  /** What each cover shows under its title: reading progress or the status badge. */
  detail: 'progress' | 'status';
  onOpen: (file: BookFile) => void;
}

/**
 * An unframed Home shelf: a titled grid of covers that open their Book on
 * click, Enter or Space. Used for Reading now, Recently added and search results.
 */
export function BookShelf({ title, action, books, detail, onOpen }: BookShelfProps): ReactElement {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
        {action}
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-6">
        {books.map((file, i) => (
          <li key={file.id}>
            <ShelfBook
              file={file}
              accent={AVATAR_COLORS[i % AVATAR_COLORS.length]}
              detail={detail}
              onOpen={() => onOpen(file)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShelfBook({
  file,
  accent,
  detail,
  onOpen,
}: {
  file: BookFile;
  accent: string;
  detail: BookShelfProps['detail'];
  onOpen: () => void;
}): ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex cursor-pointer flex-col items-start gap-1.5 rounded-md text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
    >
      <BookCover
        file={file}
        className={`aspect-2/3 w-full rounded-md text-xl font-semibold transition-transform duration-200 group-hover:scale-[1.03] ${accent}`}
        fallback={<span>{initials(file.title)}</span>}
      />
      <h3 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:underline">
        {file.title}
      </h3>
      {detail === 'progress' ? (
        <ShelfProgress file={file} />
      ) : (
        <Badge variant={statusBadgeVariant(file.status)}>{statusLabel(file.status)}</Badge>
      )}
    </div>
  );
}

// A Book marked as reading by hand may never have been opened, so it has no
// percent to show yet.
function ShelfProgress({ file }: { file: BookFile }): ReactElement {
  const percent = readingProgressPercent(file);
  if (percent == null) {
    return <span className="text-muted-foreground text-xs">Not opened yet</span>;
  }
  return (
    <div className="text-muted-foreground flex w-full items-center gap-2 text-xs tabular-nums">
      <Progress value={percent} aria-label={`Reading progress for ${file.title}`} />
      <span className="shrink-0">{percent}%</span>
    </div>
  );
}
