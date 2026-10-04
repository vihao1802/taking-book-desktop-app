import { CloudOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/** Marks a Book in the Library whose PDF is not on this device. */
export function RemoteOnlyBadge() {
  return (
    <Badge variant="outline" className="w-fit gap-1 text-xs">
      <CloudOff className="size-3" aria-hidden="true" />
      Not on this device
    </Badge>
  );
}
