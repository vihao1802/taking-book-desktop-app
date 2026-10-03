import { useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react';
import { Moon, Search, Sun, Sunrise, type LucideIcon } from 'lucide-react';
import {
  arrangeHome,
  formatGreetingDateTime,
  formatLocalMinute,
  getGreeting,
  getTimeOfDay,
  type TimeOfDay,
} from '@taking-book/core';
import type { BookFile } from '@/reader-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMinuteClock } from '@/lib/useMinuteClock';
import { useSearchShortcut } from '@/lib/useSearchShortcut';
import { cn } from '@/lib/utils';
import { useAddPdf } from '../library/useAddPdf';
import { useLibrary } from '../library/useLibrary';
import { BookShelf } from './BookShelf';
import { FeaturedBookCard } from './FeaturedBookCard';
import { useHomeEntrance, type HomeEntrance } from './useHomeEntrance';
import type { View } from '@/components/NavRail';

const TIME_OF_DAY_ICONS: Record<TimeOfDay, LucideIcon> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Moon,
  night: Moon,
};

interface HomeProps {
  onOpen: (file: BookFile) => void;
  onNavigate: (view: View) => void;
}

/**
 * Home: one centered column of the header, then either search results or the
 * launchpad (Featured book and shelves), or an invitation when the library is empty.
 * Below the header it stays blank until the library has loaded, so a full
 * library never flashes the empty-library invitation at launch.
 */
export function Home({ onOpen, onNavigate }: HomeProps): ReactElement {
  const { files, loaded } = useLibrary();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchRef);
  const entrance = useHomeEntrance(loaded);
  const searching = query.trim().length > 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 p-8">
      <HomeHeader query={query} onQueryChange={setQuery} searchRef={searchRef} />
      {!loaded ? null : searching ? (
        <SearchResults files={files} query={query} onOpen={onOpen} />
      ) : files.length === 0 ? (
        <EmptyLibraryInvitation onOpen={onOpen} />
      ) : (
        <Launchpad files={files} entrance={entrance} onOpen={onOpen} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function HomeHeader({
  query,
  onQueryChange,
  searchRef,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}): ReactElement {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Greeting />
      <div className="relative flex shrink-0 items-center">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" />
        <Input
          ref={searchRef}
          type="search"
          placeholder="Search books"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-56 pl-9"
        />
      </div>
    </header>
  );
}

/**
 * The Greeting: time-of-day wording and icon, then the date and time. It
 * re-renders on every minute so both stay current while Home is open. On a
 * narrow window the date and time wrap below the greeting first; only when the
 * greeting itself no longer fits beside the search does the search wrap.
 */
function Greeting(): ReactElement {
  const now = useMinuteClock();
  const timeOfDay = getTimeOfDay(now.getHours());
  const Icon = TIME_OF_DAY_ICONS[timeOfDay];
  return (
    // basis-0 lets the header measure this row by the greeting alone, so the date
    // wraps before the search does. The separator sits in the gap left of the date
    // and time; when they wrap it falls outside the box and is clipped, so no line
    // opens with "·". Its empty alt text keeps screen readers from announcing it.
    <div className="flex min-w-min flex-1 basis-0 flex-wrap items-center gap-x-4 gap-y-1 overflow-hidden">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight whitespace-nowrap">
        <Icon className="text-primary size-6" />
        {getGreeting(timeOfDay)}
      </h1>
      <time
        dateTime={formatLocalMinute(now)}
        className="text-muted-foreground relative before:absolute before:right-full before:mr-1.5 before:[content:'·'_/_'']"
      >
        {formatGreetingDateTime(now, window.api.systemLocale)}
      </time>
    </div>
  );
}

function Launchpad({
  files,
  entrance,
  onOpen,
  onNavigate,
}: {
  files: BookFile[];
  entrance: HomeEntrance;
  onOpen: (file: BookFile) => void;
  onNavigate: (view: View) => void;
}): ReactElement {
  const { busy } = useLibrary();
  const { featured, readingNow, recentlyAdded } = useMemo(() => arrangeHome(files), [files]);
  const { endEntrance } = entrance;
  useEffect(() => endEntrance, [endEntrance]);
  return (
    // Its three sections ease in one after another; index.css staggers exactly
    // three children, so a new section needs a delay of its own there.
    <div className={cn('flex flex-col gap-10', entrance.className)}>
      {featured && <FeaturedBookCard featured={featured} busy={busy} onOpen={onOpen} />}
      {readingNow.length > 0 && (
        <BookShelf title="Reading now" books={readingNow} detail="progress" onOpen={onOpen} />
      )}
      {recentlyAdded.length > 0 && (
        <BookShelf
          title="Recently added"
          action={
            <Button
              variant="link"
              className="text-muted-foreground h-auto shrink-0 p-0"
              onClick={() => onNavigate('library')}
            >
              Browse more
            </Button>
          }
          books={recentlyAdded}
          detail="status"
          onOpen={onOpen}
        />
      )}
    </div>
  );
}

function SearchResults({
  files,
  query,
  onOpen,
}: {
  files: BookFile[];
  query: string;
  onOpen: (file: BookFile) => void;
}): ReactElement {
  const needle = query.trim().toLowerCase();
  const results = useMemo(
    () => files.filter((f) => f.title.toLowerCase().includes(needle)),
    [files, needle],
  );
  if (results.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center">
        No books match “{query}”. Try a different title.
      </p>
    );
  }
  return <BookShelf title={`Results for “${query.trim()}”`} books={results} detail="status" onOpen={onOpen} />;
}

// The floating Add PDF button stays hidden while the library is empty, so this
// is the only Add PDF control on screen.
function EmptyLibraryInvitation({ onOpen }: { onOpen: (file: BookFile) => void }): ReactElement {
  const { busy } = useLibrary();
  const handleAdd = useAddPdf(onOpen);
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h2 className="text-xl font-semibold">Your library is empty</h2>
      <p className="text-muted-foreground">Add a PDF to start reading.</p>
      <Button onClick={handleAdd} disabled={busy}>
        {busy ? 'Adding…' : 'Add PDF'}
      </Button>
    </div>
  );
}
