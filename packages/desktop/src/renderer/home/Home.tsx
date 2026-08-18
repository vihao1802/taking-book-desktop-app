import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, Moon, Search, Sun, Sunrise } from 'lucide-react';
import { progressFraction } from '@taking-book/core';
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
import { statusBadgeVariant, statusLabel } from '@/lib/status';
import { useSearchShortcut } from '@/lib/useSearchShortcut';
import { Progress } from '@/components/ui/progress';
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

function readingProgress(file: BookFile): number | null {
  if (file.pageCount == null || file.lastPage == null) return null;
  return progressFraction(
    { page: file.lastPage, position: file.lastPosition ?? 0 },
    file.pageCount,
  );
}

export function Home({
  onOpen,
  onNavigate,
}: {
  onOpen: (file: BookFile) => void;
  onNavigate: (view: View) => void;
}) {
  const { files, addFiles, busy } = useLibrary();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchRef);

  const inProgress = useMemo(() => files.filter((f) => f.status === 'reading'), [files]);

  const featuredCandidates = useMemo(
    () => (inProgress.length > 0 ? inProgress : files.slice(0, 1)),
    [inProgress, files],
  );
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    setFeaturedIndex(0);
  }, [featuredCandidates.length]);

  const featured =
    featuredCandidates.length > 0 ? featuredCandidates[featuredIndex % featuredCandidates.length] : null;

  const stepFeatured = (delta: number) => {
    setFeaturedIndex((i) => (i + delta + featuredCandidates.length) % featuredCandidates.length);
  };

  const picks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = q ? files.filter((f) => f.title.toLowerCase().includes(q)) : files;
    return scoped.slice(0, 4);
  }, [files, query]);

  const handleAdd = async () => {
    const added = await addFiles();
    if (added.length === 1) onOpen(added[0]);
  };

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

        <Card className="group transition-all hover:border-ink/25 hover:shadow-md">
          <CardContent
            className="flex cursor-pointer gap-6 p-6 flex-col md:flex-row"
            onClick={() => featured && onOpen(featured)}
          >
            {featured ? (
              <>
                <BookCover
                  file={featured}
                  className="bg-ink text-card h-67.5 w-45 shrink-0 rounded-md shadow-sm transition-transform duration-200 group-hover:scale-[1.02]"
                  fallback={<span className="text-3xl font-semibold">{initials(featured.title)}</span>}
                />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <div className="flex w-full items-center justify-between gap-3">
                    <p className="text-muted-foreground text-sm">Continue reading</p>
                    {featuredCandidates.length > 1 && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground size-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            stepFeatured(-1);
                          }}
                          aria-label="Previous in-progress book"
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {featuredIndex + 1} / {featuredCandidates.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground size-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            stepFeatured(1);
                          }}
                          aria-label="Next in-progress book"
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <h2 className="text-3xl font-semibold leading-tight tracking-tight group-hover:underline">
                    {featured.title}
                  </h2>
                  <div className="text-muted-foreground flex items-center gap-3 text-sm">
                    <Badge variant={statusBadgeVariant(featured.status)}>
                      {statusLabel(featured.status)}
                    </Badge>
                    {featured.lastPage !== null && <span>Page {featured.lastPage}</span>}
                  </div>
                  <div className="w-full max-w-72">
                    <Progress
                      value={progressPercent(featured)}
                      aria-label={`Reading progress for ${featured.title}`}
                    />
                  </div>
                  <Button
                    className="mt-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(featured);
                    }}
                    disabled={busy}
                  >
                    Continue reading
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-start gap-4">
                <p className="text-muted-foreground">
                  Your library is empty. Add a PDF to start reading.
                </p>
                <Button onClick={handleAdd} disabled={busy}>
                  {busy ? 'Adding…' : 'Add PDF'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Top picks for you</h3>
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
                        {file.lastPage !== null ? `Page ${file.lastPage}` : 'Just started'}
                      </span>
                    </div>
                    <Progress value={progressPercent(file)} aria-hidden="true" />
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

function progressPercent(file: BookFile): number {
  const fraction = readingProgress(file);
  return fraction == null ? 0 : Math.round(fraction * 100);
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
        className={`aspect-2/3 rounded-md text-xl font-semibold transition-transform duration-200 group-hover:scale-[1.03] ${accent}`}
        fallback={<span>{initials(file.title)}</span>}
      />
      <h4 className="line-clamp-2 text-sm font-semibold leading-tight group-hover:underline">
        {file.title}
      </h4>
      <Badge variant={statusBadgeVariant(file.status)}>{statusLabel(file.status)}</Badge>
    </div>
  );
}