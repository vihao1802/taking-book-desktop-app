import { useCallback, useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { isOk } from '@taking-book/core';
import type { BookFile, ReadingStats } from '../../shared/types';
import { BookCover } from '@/components/BookCover';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { initials } from '@/lib/initials';
import { useLibrary } from '../library/useLibrary';
import { AreaChart } from './AreaChart';
import { formatDay } from './chartAxes';

const CHART_DAYS = 30;

export function Statistics({
  onOpen,
}: {
  onOpen: (file: BookFile) => void;
}) {
  const { files } = useLibrary();
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.api.getReadingStats().then((result) => {
      if (isOk(result)) setStats(result.data);
      else setError(result.error);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const readAgain = files.find((f) => f.status === 'reading') ?? files[0] ?? null;
  const firstDay = stats?.series[0]?.day;
  const lastDay = stats?.series[stats.series.length - 1]?.day;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-6 sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
        {readAgain && (
          <Button onClick={() => onOpen(readAgain)}>Continue reading</Button>
        )}
      </header>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Today</span>
            <span className="text-2xl font-semibold tabular-nums">
              {Math.round(stats?.minutesToday ?? 0)} min
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">This month</span>
            <span className="text-2xl font-semibold tabular-nums">
              {Math.round(stats?.totalMinutes ?? 0)} min
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Current streak</span>
            <span className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
              <Flame className="text-amber-500 size-6" />
              {stats?.currentStreak ?? 0} day{stats && stats.currentStreak === 1 ? '' : 's'}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Best streak</span>
            <span className="text-2xl font-semibold tabular-nums">
              {stats?.longestStreak ?? 0} day{stats && stats.longestStreak === 1 ? '' : 's'}
            </span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Reading time</h3>
            {firstDay && lastDay && (
              <span className="text-muted-foreground text-sm">
                {formatDay(firstDay)} – {formatDay(lastDay)}
              </span>
            )}
          </div>
          <AreaChart
            data={stats?.series ?? []}
            ariaLabel={`Reading minutes per day over the last ${CHART_DAYS} days`}
          />
        </CardContent>
      </Card>

      {readAgain && (
        <Card className="group transition-all hover:border-ink/25 hover:shadow-md">
          <CardContent
            className="flex cursor-pointer items-center gap-4 p-6"
            onClick={() => onOpen(readAgain)}
          >
            <BookCover
              file={readAgain}
              className="bg-ink text-card size-24 shrink-0 rounded-md shadow-sm transition-transform duration-200 group-hover:scale-[1.02]"
              fallback={<span className="text-lg font-semibold">{initials(readAgain.title)}</span>}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-muted-foreground text-sm">Keep going with</span>
              <h3 className="truncate text-lg font-semibold group-hover:underline">
                {readAgain.title}
              </h3>
            </div>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onOpen(readAgain);
              }}
            >
              Open
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}