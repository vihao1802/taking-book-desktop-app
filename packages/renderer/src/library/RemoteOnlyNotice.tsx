import { CloudOff } from 'lucide-react';
import type { RemoteOnlyBook } from '@/reader-api';
import { Button } from '@/components/ui/button';

interface RemoteOnlyNoticeProps {
  remoteOnly: RemoteOnlyBook;
  downloading: boolean;
  onDownloadNow: () => void;
}

/**
 * Says in Book details that a Book's PDF is not on this device, why, and what
 * to do: a one-off Download now when the network or storage is the reason, and
 * nothing to press when the PDF is simply too large (read it on desktop).
 */
export function RemoteOnlyNotice({ remoteOnly, downloading, onDownloadNow }: RemoteOnlyNoticeProps) {
  return (
    <div role="status" aria-label="Not on this device" className="border-border flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <CloudOff className="size-4 shrink-0" aria-hidden="true" />
        Not on this device
      </p>
      <p className="text-muted-foreground">{remoteOnly.message}</p>
      {remoteOnly.canDownloadNow && (
        <Button className="w-fit" onClick={onDownloadNow} disabled={downloading}>
          {downloading ? 'Downloading…' : 'Download now'}
        </Button>
      )}
    </div>
  );
}
