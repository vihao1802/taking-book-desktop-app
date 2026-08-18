import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { progressFraction } from '@taking-book/core';
import type { BookFile } from '../../shared/types';
import { Badge } from '@/components/ui/badge';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { initials } from '@/lib/initials';
import { statusBadgeVariant, statusLabel } from '@/lib/status';
import { useLibrary } from '../library/useLibrary';

function progressPercent(file: BookFile): number | null {
  if (file.pageCount == null || file.lastPage == null) return null;
  const fraction = progressFraction(
    { page: file.lastPage, position: file.lastPosition ?? 0 },
    file.pageCount,
  );
  return fraction == null ? null : Math.round(fraction * 100);
}

export function Favorites({
  onOpen,
  onNavigate,
}: {
  onOpen: (file: BookFile) => void;
  onNavigate: (view: 'library' | 'favorites') => void;
}) {
  const { files, setFavorite } = useLibrary();

  const favorites = useMemo(() => files.filter((f) => f.favorite), [files]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Favorites</h1>
        <Button variant="outline" onClick={() => onNavigate('library')}>
          Browse all books
        </Button>
      </header>

      {favorites.length === 0 ? (
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
          <Star className="size-8 opacity-40" />
          <p>No favorites yet. Tap the star on a book to keep it here.</p>
          <Button variant="link" className="text-primary h-auto p-0" onClick={() => onNavigate('library')}>
            Go to Library
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {favorites.map((file) => {
            const progress = progressPercent(file);
            return (
              <li key={file.id}>
                <Card
                  className="group h-full cursor-pointer transition-all hover:border-ink/25 hover:shadow-md"
                  onClick={() => onOpen(file)}
                >
                  <CardContent className="flex h-full flex-col gap-2.5 p-4">
                    <BookCover
                      file={file}
                      className="bg-secondary/60 aspect-2/3 w-full rounded-md text-xl font-semibold transition-transform duration-200 group-hover:scale-[1.02]"
                      fallback={<span>{initials(file.title)}</span>}
                    />
                    <button
                      className="text-left text-base leading-snug font-semibold hover:underline cursor-pointer"
                      onClick={() => onOpen(file)}
                    >
                      {file.title}
                    </button>
                    <Badge variant={statusBadgeVariant(file.status)} className="w-fit">
                      {statusLabel(file.status)}
                    </Badge>
                    {progress != null && (
                      <Progress value={progress} aria-label={`Reading progress for ${file.title}`} />
                    )}
                    <div className="mt-auto flex justify-end pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-amber-500 h-auto px-2 py-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFavorite(file.id, false);
                        }}
                        aria-label={`Remove ${file.title} from favorites`}
                      >
                        <Star className="size-4 fill-current" />
                        <span className="sr-only">Unfavorite</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}