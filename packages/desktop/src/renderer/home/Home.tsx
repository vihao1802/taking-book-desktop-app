import { useMemo, useRef, useState } from 'react';
import { Menu, Moon, Search, Sun, Sunrise } from 'lucide-react';
import { arrangeHome } from '@taking-book/core';
import type { BookFile } from '../../shared/types';
import { Badge } from '@/components/ui/badge';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { initials } from '@/lib/initials';
import { progressLine, readingProgressPercent } from '@/lib/progress';
import { statusBadgeVariant, statusLabel } from '@/lib/status';
import { useSearchShortcut } from '@/lib/useSearchShortcut';
import { Progress } from '@/components/ui/progress';
import { useAddPdf } from '../library/useAddPdf';
import { FeaturedBookCard } from './FeaturedBookCard';
import { useLibrary } from '../library/useLibrary';
import type { View } from '@/components/NavRail';

const AVATAR_COLORS = ['bg-avatar-a', 'bg-avatar-b'];

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function greetingIconForHour(hour: number): typeof Sun {
  if (hour < 12) return Sunrise;
  if (hour < 18) return Sun;
  return Moon;
}

function TimeIcon(props: { className?: string }) {
  const Icon = greetingIconForHour(new Date().getHours());
  return <Icon {...props} />;
}

export function Home({
  onOpen,
  onNavigate,
}: {
  onOpen: (file: BookFile) => void;
  onNavigate: (view: View) => void;
}) {
  const { files, busy } = useLibrary();
  const handleAdd = useAddPdf(onOpen);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchRef);

  const { featured, readingNow } = useMemo(() => arrangeHome(files), [files]);
  const inProgress = useMemo(
    () => (featured?.kind === 'continue' ? [featured.book, ...readingNow] : []),
    [featured, readingNow],
  );

  // A live query swaps the home cards for filtered results; an explicit empty
  // state tells the user the search matched nothing instead of leaving the
  // continue-reading card untouched.
  const trimmedQuery = query.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;
  const results = useMemo(
    () => (searching ? files.filter((f) => f.title.toLowerCase().includes(trimmedQuery)) : []),
    [files, searching, trimmedQuery],
  );

  const picks = useMemo(() => files.slice(0, 4), [files]);

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
            <TimeIcon className="text-primary size-6" />
            {greetingForHour(new Date().getHours())}
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="text-muted-foreground pointer-events-none absolute left-3 size-4" />
              <Input
                ref={searchRef}
                type="search"
                placeholder="Search books"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56 pl-9"
              />
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="xl:hidden"
                  aria-label="Show reading summary"
                >
                  <Menu className="size-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-rail top-0 right-0 left-auto h-full w-full max-w-sm translate-x-0 translate-y-0 gap-6 overflow-y-auto rounded-none border-0 border-l p-6 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full">
                <DialogHeader className="sr-only">
                  <DialogTitle>Reading summary</DialogTitle>
                </DialogHeader>
                <HomeSidePanel files={files} inProgress={inProgress} onOpen={onOpen} />
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {searching ? (
          <Card>
            <CardContent className="flex flex-col gap-4 p-6">
              <h3 className="text-lg font-semibold">Search results</h3>
              {results.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center">
                  No books match “{query}”. Try a different title.
                </p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
                  {results.map((file, i) => (
                    <BookPick
                      key={file.id}
                      file={file}
                      accent={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                      onOpen={() => onOpen(file)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : featured ? (
          <FeaturedBookCard featured={featured} busy={busy} onOpen={onOpen} />
        ) : files.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-4 p-6">
              <p className="text-muted-foreground">
                Your library is empty. Add a PDF to start reading.
              </p>
              <Button onClick={handleAdd} disabled={busy}>
                {busy ? 'Adding…' : 'Add PDF'}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!searching && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recently added</h3>
              <Button variant="link" className="text-muted-foreground h-auto p-0" onClick={() => onNavigate('library')}>
                Browse more
              </Button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
              {picks.map((file, i) => (
                <BookPick
                  key={file.id}
                  file={file}
                  accent={AVATAR_COLORS[i % AVATAR_COLORS.length]}
                  onOpen={() => onOpen(file)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      <aside className="bg-rail hidden w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-border p-6 xl:flex">
        <HomeSidePanel files={files} inProgress={inProgress} onOpen={onOpen} />
      </aside>
    </div>
  );
}

function HomeSidePanel({
  files,
  inProgress,
  onOpen,
}: {
  files: BookFile[];
  inProgress: BookFile[];
  onOpen: (file: BookFile) => void;
}) {
  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h3 className="text-lg font-semibold">Reading now</h3>
          {inProgress.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing in progress yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {inProgress.map((file, i) => (
                <li
                  key={file.id}
                  className="group -mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60"
                  onClick={() => onOpen(file)}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
                  >
                    {initials(file.title)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium group-hover:underline">
                        {file.title}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {progressLine(file) ?? 'Just started'}
                      </span>
                    </div>
                    <Progress value={readingProgressPercent(file) ?? 0} aria-hidden="true" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <h3 className="text-lg font-semibold">Library at a glance</h3>
          <dl className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground text-sm">Books</dt>
              <dd className="text-sm font-semibold">{files.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground text-sm">Reading</dt>
              <dd className="text-sm font-semibold">{inProgress.length}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground text-sm">Finished</dt>
              <dd className="text-sm font-semibold">
                {files.filter((f) => f.status === 'finished').length}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}

function BookPick({
  file,
  accent,
  onOpen,
}: {
  file: BookFile;
  accent: string;
  onOpen: () => void;
}) {
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
      <h4 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:underline">
        {file.title}
      </h4>
      <Badge variant={statusBadgeVariant(file.status)}>{statusLabel(file.status)}</Badge>
    </div>
  );
}