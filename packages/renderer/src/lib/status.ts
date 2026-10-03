import type { BookStatus } from '@/reader-api';

export const STATUS_OPTIONS: Array<{ value: BookStatus; label: string }> = [
  { value: 'unread', label: 'To read' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
];

export function statusLabel(status: BookStatus): string {
  const option = STATUS_OPTIONS.find((o) => o.value === status);
  return option?.label ?? status;
}

export function statusBadgeVariant(status: BookStatus): 'default' | 'secondary' | 'success' {
  switch (status) {
    case 'reading':
      return 'default';
    case 'finished':
      return 'success';
    case 'unread':
      return 'secondary';
  }
}
