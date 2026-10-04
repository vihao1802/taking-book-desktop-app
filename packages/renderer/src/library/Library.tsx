import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Cloud, FolderSync, LayoutGrid, List, MoreHorizontal, Star } from 'lucide-react';
import type { BookFile, BookStatus } from '@/reader-api';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { initials } from '@/lib/initials';
import { useCapabilities } from '@/lib/useCapabilities';
import { readingProgressPercent } from '@/lib/progress';
import { STATUS_OPTIONS, statusBadgeVariant } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useSearchShortcut } from '@/lib/useSearchShortcut';
import { useWindowSizeClass } from '@/lib/useWindowSizeClass';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuizDialog } from '../quiz/QuizDialog';
import { BookDetails } from './BookDetails';
import { DeviceCodeNotice } from './DeviceCodeNotice';
import { describeSkippedDownloads } from './skipped-downloads';
import { getBookDetailsPresentation } from './book-details-presentation';
import { useAddPdf } from './useAddPdf';
import { useLibrary } from './useLibrary';

export function Library({
  onOpen,
}: {
  /** Opens a Book; pass a page to open the reader at that page instead of the saved spot. */
  onOpen: (file: BookFile, page?: number) => void;
}) {
  const {
    files,
    error,
    busy,
    account,
    connecting,
    deviceCode,
    sync,
    setStatus,
    setTags,
    setTitle,
    setFavorite,
    removeFile,
    connectCloud,
    disconnectCloud,
    runSync,
  } = useLibrary();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<BookFile | null>(null);
  const { quiz: quizEnabled } = useCapabilities();
  const [quizFile, setQuizFile] = useState<BookFile | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  // The Book whose details are showing; looked up in `files` on every render so edits show at once.
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const sizeClass = useWindowSizeClass();
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchRef);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) for (const tag of file.tags) set.add(tag);
    return [...set].sort();
  }, [files]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return files.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (tagFilter !== 'all' && !f.tags.includes(tagFilter)) return false;
      if (favoritesOnly && !f.favorite) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [files, query, statusFilter, tagFilter, favoritesOnly]);

  const handleOpen = useAddPdf(onOpen);

  const detailsFile = files.find((f) => f.id === detailsId) ?? null;
  const presentation = getBookDetailsPresentation({ view, sizeClass });

  // The sheet and the dialogs it leads to are all modal, so the sheet goes away before another opens.
  const bookDetails = (file: BookFile, inPane: boolean) => (
    <BookDetails
      file={file}
      onOpen={() => {
        setDetailsId(null);
        onOpen(file);
      }}
      onSetStatus={(status) => setStatus(file.id, status)}
      onSetTags={(tags) => setTags(file.id, tags)}
      onToggleFavorite={() => setFavorite(file.id, !file.favorite)}
      onRename={(title) => setTitle(file.id, title)}
      onRemove={() => {
        setDetailsId(null);
        setPendingRemove(file);
      }}
      onQuiz={
        quizEnabled
          ? () => {
              setDetailsId(null);
              setQuizFile(file);
            }
          : null
      }
      onClose={inPane ? () => setDetailsId(null) : undefined}
    />
  );

  const confirmRemove = async () => {
    if (!pendingRemove) return;
    await removeFile(pendingRemove.id);
    setPendingRemove(null);
  };

  const isReconnectNeeded = Boolean(
    sync.error &&
      (sync.error.toLowerCase().includes('reconnect') ||
        sync.error.toLowerCase().includes('expired') ||
        sync.error.toLowerCase().includes('invalid_grant')),
  );

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6 sm:p-8">
      <header className="flex flex-wrap items-center gap-5">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Library</h1>
        <div className="flex items-center gap-2.5">
          <div className="border-border bg-secondary/50 flex items-center gap-0.5 rounded-full border p-0.5">
            <button
              type="button"
              className={`flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors ${
                view === 'grid' ? 'bg-ink text-card' : 'text-muted-foreground hover:text-ink'
              }`}
              onClick={() => setView('grid')}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              className={`flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors ${
                view === 'list' ? 'bg-ink text-card' : 'text-muted-foreground hover:text-ink'
              }`}
              onClick={() => setView('list')}
              aria-label="List view"
              aria-pressed={view === 'list'}
            >
              <List className="size-4" />
            </button>
          </div>
          <Input
            ref={searchRef}
            type="search"
            placeholder="Search title or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-52 rounded-full"
          />
          <Button onClick={handleOpen} disabled={busy}>
            {busy ? 'Adding…' : 'Add PDF'}
          </Button>
        </div>
      </header>

      <section className="border-border flex flex-wrap items-center justify-between gap-4 rounded-lg border px-3.5 py-2.5">
        {account ? (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Cloud className="text-muted-foreground size-4 shrink-0" />
              <span className="text-muted-foreground text-sm">Google Drive:</span>
              <span className="max-w-80 truncate text-sm" title={account.email}>
                {account.displayName}
                {account.email ? ` (${account.email})` : ''}
              </span>
              {isReconnectNeeded && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={connectCloud}
                  disabled={connecting}
                >
                  {connecting ? 'Connecting…' : 'Reconnect'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={disconnectCloud}>
                Disconnect
              </Button>
            </div>
            <Button size="sm" onClick={runSync} disabled={sync.syncing}>
              <FolderSync className="size-4" />
              {sync.syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <FolderSync className="text-muted-foreground size-4 shrink-0" />
            <span className="text-muted-foreground text-sm">Sync:</span>
            <span className="text-sm">not connected</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={connectCloud}
              disabled={connecting}
            >
              {connecting ? 'Connecting…' : 'Connect Google Drive'}
            </Button>
          </div>
        )}
      </section>

      {deviceCode && <DeviceCodeNotice prompt={deviceCode} />}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as BookStatus | 'all')}>
          <SelectTrigger className="h-8 rounded-full text-xs" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="h-8 max-w-44 rounded-full text-xs" aria-label="Filter by tag">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tags</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={favoritesOnly ? 'default' : 'outline'}
          size="sm"
          className="h-8 cursor-pointer rounded-full text-xs"
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
        >
          <Star className={cn('size-4', favoritesOnly && 'fill-current')} />
          Favorites
        </Button>
      </div>

      {sync.error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{sync.error}</span>
          </div>
          {isReconnectNeeded && (
            <Button
              size="sm"
              variant="destructive"
              className="h-7 text-xs"
              onClick={connectCloud}
              disabled={connecting}
            >
              {connecting ? 'Connecting…' : 'Reconnect account'}
            </Button>
          )}
        </div>
      )}
      {sync.last && (
        <p className="text-muted-foreground text-sm">
          Last sync: {sync.last.added} added, {sync.last.updated} updated, {sync.last.deleted} deleted
          {sync.last.uploaded > 0 ? `, ${sync.last.uploaded} uploaded` : ''}
          {sync.last.downloaded > 0 ? `, ${sync.last.downloaded} downloaded` : ''}
          {sync.last.warnings.length > 0 ? ` (${sync.last.warnings.length} warnings)` : ''}
        </p>
      )}

      {sync.last &&
        describeSkippedDownloads(sync.last.skippedDownloads).map((message) => (
          <p key={message} role="status" className="text-muted-foreground text-sm">
            {message}
          </p>
        ))}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {visible.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center">
          <p>{files.length === 0 ? 'No books yet. Add a PDF to get started.' : 'No matches.'}</p>
        </div>
      ) : view === 'grid' ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {visible.map((file) => (
            <BookCard
              key={file.id}
              file={file}
              onOpen={() => onOpen(file)}
              onSetStatus={(status) => setStatus(file.id, status)}
              onSetTags={(tags) => setTags(file.id, tags)}
              onToggleFavorite={() => setFavorite(file.id, !file.favorite)}
              onRemove={() => setPendingRemove(file)}
              onRename={(title) => setTitle(file.id, title)}
              onQuiz={quizEnabled ? () => setQuizFile(file) : null}
              onShowDetails={() => setDetailsId(file.id)}
            />
          ))}
        </ul>
      ) : (
        <div className="flex items-start gap-5">
          <ul className="flex min-w-0 flex-1 flex-col gap-2">
            {visible.map((file) => (
              <BookRow
                key={file.id}
                file={file}
                onOpen={() => onOpen(file)}
                onSetStatus={(status) => setStatus(file.id, status)}
                onSetTags={(tags) => setTags(file.id, tags)}
                onToggleFavorite={() => setFavorite(file.id, !file.favorite)}
                onRemove={() => setPendingRemove(file)}
                onRename={(title) => setTitle(file.id, title)}
                onQuiz={quizEnabled ? () => setQuizFile(file) : null}
                onShowDetails={() => setDetailsId(file.id)}
              />
            ))}
          </ul>
          {presentation === 'pane' && detailsFile && (
            <aside className="border-border bg-card sticky top-0 w-96 shrink-0 rounded-lg border p-5">
              {bookDetails(detailsFile, true)}
            </aside>
          )}
        </div>
      )}

      {presentation === 'sheet' && (
        <Sheet open={detailsFile != null} onOpenChange={(open) => !open && setDetailsId(null)}>
          {detailsFile && <SheetContent title={`Details for ${detailsFile.title}`}>{bookDetails(detailsFile, false)}</SheetContent>}
        </Sheet>
      )}

      {quizEnabled && quizFile && (
        <QuizDialog
          file={quizFile}
          onOpenChange={(open) => !open && setQuizFile(null)}
          onOpenAtPage={(page) => onOpen(quizFile, page)}
        />
      )}

      <Dialog open={pendingRemove != null} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from library?</DialogTitle>
            <DialogDescription>
              “{pendingRemove?.title}” will be removed from this library. Any synced copy on
              other devices will also be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookCard({
  file,
  onOpen,
  onSetStatus,
  onSetTags,
  onToggleFavorite,
  onRemove,
  onRename,
  onQuiz,
  onShowDetails,
}: {
  file: BookFile;
  onOpen: () => void;
  onSetStatus: (status: BookStatus) => void;
  onSetTags: (tags: string[]) => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
  onRename: (title: string) => void;
  onQuiz: (() => void) | null;
  onShowDetails: () => void;
}) {
  const [draftTag, setDraftTag] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(file.title);

  const commitTag = () => {
    const tag = draftTag.trim();
    setDraftTag('');
    if (tag && !file.tags.includes(tag)) onSetTags([...file.tags, tag]);
  };

  const progress = readingProgressPercent(file);

  return (
    <li>
      <Card
        className="group h-full cursor-pointer transition-all hover:border-ink/25 hover:shadow-md"
        onClick={onOpen}
      >
        <CardContent className="flex h-full flex-col gap-2.5 p-4">
          <div className="relative">
            <BookCover
              file={file}
              className="bg-secondary/60 aspect-2/3 w-full rounded-md text-xl font-semibold transition-transform duration-200 group-hover:scale-[1.02]"
              fallback={<span>{initials(file.title)}</span>}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 left-2 size-8 cursor-pointer rounded-full bg-black/30 hover:bg-black/40"
              onClick={(e) => {
                e.stopPropagation();
                onShowDetails();
              }}
              aria-label={`Details for ${file.title}`}
            >
              <MoreHorizontal className="size-4 text-white" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 size-8 cursor-pointer rounded-full bg-black/30 hover:bg-black/40"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              aria-label={file.favorite ? `Remove ${file.title} from favorites` : `Add ${file.title} to favorites`}
            >
              <Star
                className={`size-4 ${file.favorite ? 'fill-current text-amber-400' : 'text-white'}`}
              />
            </Button>
          </div>
          <button
            className="text-left text-base leading-snug font-semibold hover:underline cursor-pointer"
            onClick={onOpen}
          >
            {file.title}
          </button>

          {file.status === 'reading' && progress != null && (
            <Progress value={progress} aria-label={`Reading progress for ${file.title}`} />
          )}

          <Select value={file.status} onValueChange={(s) => onSetStatus(s as BookStatus)}>
            <SelectTrigger
              className={cn(
                badgeVariants({ variant: statusBadgeVariant(file.status) }),
                'h-7 cursor-pointer rounded-full px-3 text-xs compact:hidden',
              )}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Status for ${file.title}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-1.5 compact:hidden">
            {file.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="group cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetTags(file.tags.filter((t) => t !== tag));
                }}
                title="Remove tag"
              >
                {tag}
                <span className="text-muted-foreground" aria-hidden="true">
                  ×
                </span>
              </Badge>
            ))}
            <form
              className="inline-flex"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                commitTag();
              }}
            >
              <Input
                value={draftTag}
                placeholder="+ tag"
                onChange={(e) => setDraftTag(e.target.value)}
                className="h-6 w-16 rounded-full border-dashed text-xs"
                aria-label={`Add tag to ${file.title}`}
              />
            </form>
          </div>

          <div className="mt-auto flex items-center justify-between gap-2.5 pt-2.5">
            <p className="text-muted-foreground text-xs">
              Added {new Date(file.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString()}
            </p>
            <div className="flex items-center gap-2">
              {onQuiz && file.lastPage != null && file.lastPage > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-primary h-auto px-1 py-0.5 text-xs compact:hidden"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuiz();
                  }}
                  aria-label={`Take a Quiz on ${file.title}`}
                >
                  Quiz
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary h-auto px-1 py-0.5 text-xs compact:hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftTitle(file.title);
                  setRenaming(true);
                }}
                aria-label={`Rename ${file.title}`}
              >
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary h-auto px-1 py-0.5 text-xs compact:hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                aria-label={`Remove ${file.title} from library`}
              >
                Remove
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <RenameDialog
        open={renaming}
        initialTitle={draftTitle}
        onOpenChange={setRenaming}
        onSubmit={(title) => {
          onRename(title);
          setRenaming(false);
        }}
      />
    </li>
  );
}

function RenameDialog({
  open,
  initialTitle,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  initialTitle: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState(initialTitle);

  useEffect(() => {
    if (open) setTitle(initialTitle);
  }, [open, initialTitle]);

  const submit = () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename book</DialogTitle>
          <DialogDescription>
            Update the title shown in your library.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Book title"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={title.trim().length === 0}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BookRow({
  file,
  onOpen,
  onSetStatus,
  onSetTags,
  onToggleFavorite,
  onRemove,
  onRename,
  onQuiz,
  onShowDetails,
}: {
  file: BookFile;
  onOpen: () => void;
  onSetStatus: (status: BookStatus) => void;
  onSetTags: (tags: string[]) => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
  onRename: (title: string) => void;
  onQuiz: (() => void) | null;
  onShowDetails: () => void;
}) {
  const [draftTag, setDraftTag] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(file.title);

  const commitTag = () => {
    const tag = draftTag.trim();
    setDraftTag('');
    if (tag && !file.tags.includes(tag)) onSetTags([...file.tags, tag]);
  };

  const progress = readingProgressPercent(file);

  return (
    <li>
      <Card
        className="group cursor-pointer transition-all hover:border-ink/25 hover:shadow-md"
        onClick={onOpen}
      >
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
            <span className="text-muted-foreground flex size-9 shrink-0 items-center justify-center">
              <BookOpen className="size-5" />
            </span>
            <button
              className="min-w-0 flex-1 truncate text-left text-sm leading-snug font-semibold hover:underline cursor-pointer"
              onClick={onOpen}
            >
              {file.title}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              aria-label={file.favorite ? `Remove ${file.title} from favorites` : `Add ${file.title} to favorites`}
              className="text-amber-500 hover:text-amber-400 cursor-pointer"
            >
              <Star className={`size-4 ${file.favorite ? 'fill-current' : 'text-muted-foreground'}`} />
            </button>
          </div>

          {file.status === 'reading' && progress != null && (
            <Progress
              value={progress}
              aria-label={`Reading progress for ${file.title}`}
              className="h-1.5 w-32"
            />
          )}

          <Select value={file.status} onValueChange={(s) => onSetStatus(s as BookStatus)}>
            <SelectTrigger
              className={cn(
                badgeVariants({ variant: statusBadgeVariant(file.status) }),
                'h-7 cursor-pointer rounded-full px-3 text-xs compact:hidden',
              )}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Status for ${file.title}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-wrap items-center gap-1.5 compact:hidden">
            {file.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="group cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetTags(file.tags.filter((t) => t !== tag));
                }}
                title="Remove tag"
              >
                {tag}
                <span className="text-muted-foreground" aria-hidden="true">
                  ×
                </span>
              </Badge>
            ))}
            <form
              className="inline-flex"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                commitTag();
              }}
            >
              <Input
                value={draftTag}
                placeholder="+ tag"
                onChange={(e) => setDraftTag(e.target.value)}
                className="h-6 w-16 rounded-full border-dashed text-xs"
                aria-label={`Add tag to ${file.title}`}
              />
            </form>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-8"
              onClick={(e) => {
                e.stopPropagation();
                onShowDetails();
              }}
              aria-label={`Details for ${file.title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
            {onQuiz && file.lastPage != null && file.lastPage > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary h-auto px-1 py-0.5 text-xs compact:hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  onQuiz();
                }}
                aria-label={`Take a Quiz on ${file.title}`}
              >
                Quiz
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary h-auto px-1 py-0.5 text-xs compact:hidden"
              onClick={(e) => {
                e.stopPropagation();
                setDraftTitle(file.title);
                setRenaming(true);
              }}
              aria-label={`Rename ${file.title}`}
            >
              Rename
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary h-auto px-1 py-0.5 text-xs compact:hidden"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label={`Remove ${file.title} from library`}
            >
              Remove
            </Button>
          </div>
        </CardContent>
      </Card>
      <RenameDialog
        open={renaming}
        initialTitle={draftTitle}
        onOpenChange={setRenaming}
        onSubmit={(title) => {
          onRename(title);
          setRenaming(false);
        }}
      />
    </li>
  );
}