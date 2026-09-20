import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
}

/** One summary tile: a small caption, then an icon next to the headline value. */
export function StatCard({ label, value, icon: Icon, iconClassName }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
        <span className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
          <Icon className={iconClassName ?? 'text-primary size-6'} />
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
