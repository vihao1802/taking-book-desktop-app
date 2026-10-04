import { useState } from 'react';
import { Play, Star, Trash2, X } from 'lucide-react';
import type { BookFile, BookStatus } from '@/reader-api';
import { badgeVariants } from '@/components/ui/badge';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { initials } from '@/lib/initials';
import { progressLine, readingProgressPercent } from '@/lib/progress';
import { STATUS_OPTIONS } from '@/lib/status';
import { cn } from '@/lib/utils';

interface BookDetailsProps {
  file: BookFile;
  onOpen: () => void;
  onSetStatus: (status: BookStatus) => void;
  onSetTags: (tags: string[]) => void;
  onToggleFavorite: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
  /** Starts a Quiz on the Book; null when the platform has no Quiz, which hides the action. */
  onQuiz: (() => void) | null;
  /** Closes the pane showing these details; omitted in a sheet, which has its own way out. */
  onClose?: () => void;
}

/**
 * A Book's details (CONTEXT.md: Book details): cover, title, progress, status,
 * tags and favorite mark, with its Open and remove actions. Everything is
 * reachable without hover, so it works by touch in a sheet as well as in a pane.
 */
export function BookDetails({
  file,
  onOpen,
  onSetStatus,
  onSetTags,
  onToggleFavorite,
  onRename,
  onRemove,
  onQuiz,
  onClose,
}: BookDetailsProps) {
  const [draftTag, setDraftTag] = useState('');
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const progress = readingProgressPercent(file);
  const progressText = progressLine(file);

  const commitTag = () => {
    const tag = draftTag.trim();
    setDraftTag('');
    if (tag && !file.tags.includes(tag)) onSetTags([...file.tags, tag]);
  };

  const commitTitle = () => {
    const title = draftTitle?.trim() ?? '';
    setDraftTitle(null);
    if (title && title !== file.title) onRename(title);
  };

  return (
    <section aria-label="Book details" className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <BookCover
          file={file}
          className="bg-secondary/60 aspect-2/3 w-24 shrink-0 rounded-md text-lg font-semibold"
          fallback={<span>{initials(file.title)}</span>}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {draftTitle === null ? (
            <>
              <h2 className="text-lg leading-snug font-semibold break-words">{file.title}</h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground -ml-3 w-fit"
                onClick={() => setDraftTitle(file.title)}
                aria-label={`Rename ${file.title}`}
              >
                Rename
              </Button>
            </>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                commitTitle();
              }}
            >
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                aria-label="Book title"
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={draftTitle.trim().length === 0}>
                  Save
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setDraftTitle(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {progressText && <p className="text-muted-foreground text-sm">{progressText}</p>}
          {progress != null && <Progress value={progress} aria-label={`Reading progress for ${file.title}`} />}
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close details">
            <X />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={file.status} onValueChange={(s) => onSetStatus(s as BookStatus)}>
          <SelectTrigger className="rounded-full" aria-label={`Status for ${file.title}`}>
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
        <Button
          variant={file.favorite ? 'default' : 'outline'}
          className="rounded-full"
          onClick={onToggleFavorite}
          aria-pressed={file.favorite}
          aria-label={file.favorite ? `Remove ${file.title} from favorites` : `Add ${file.title} to favorites`}
        >
          <Star className={file.favorite ? 'fill-current' : undefined} />
          Favorite
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {file.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={cn(badgeVariants({ variant: 'secondary' }), 'cursor-pointer gap-1.5 py-1.5 text-xs')}
            onClick={() => onSetTags(file.tags.filter((t) => t !== tag))}
            aria-label={`Remove tag ${tag}`}
          >
            {tag}
            <X className="size-3" aria-hidden="true" />
          </button>
        ))}
        <form
          className="inline-flex"
          onSubmit={(e) => {
            e.preventDefault();
            commitTag();
          }}
        >
          <Input
            value={draftTag}
            placeholder="+ tag"
            onChange={(e) => setDraftTag(e.target.value)}
            className="w-28 rounded-full border-dashed text-sm"
            aria-label={`Add tag to ${file.title}`}
          />
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button onClick={onOpen} aria-label={`Open ${file.title}`}>
          <Play />
          Open
        </Button>
        {onQuiz && file.lastPage != null && file.lastPage > 0 && (
          <Button variant="outline" onClick={onQuiz} aria-label={`Take a Quiz on ${file.title}`}>
            Quiz
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive ml-auto"
          onClick={onRemove}
          aria-label={`Remove ${file.title} from library`}
        >
          <Trash2 />
          Remove
        </Button>
      </div>
    </section>
  );
}
