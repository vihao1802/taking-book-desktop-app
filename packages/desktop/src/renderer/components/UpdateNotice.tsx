import { Download, Loader2, X } from 'lucide-react';
import type { UpdateCheck } from '@/updates/useUpdateCheck';

/**
 * Tells the reader a newer version is out, with a Download button for their
 * OS. Shown in the library views only, never over an open Book.
 */
export function UpdateNotice({ update, downloading, downloadError, download, dismiss }: UpdateCheck) {
  if (!update) return null;

  return (
    <div
      role="status"
      className="bg-card text-card-foreground fixed right-6 bottom-24 z-20 flex max-w-sm items-center gap-3 rounded-lg border py-2 pr-2 pl-4 text-sm shadow-lg"
    >
      <div className="min-w-0">
        <p>Taking Book {update.version} is available.</p>
        {downloadError && <p className="text-destructive mt-0.5 text-xs">{downloadError}</p>}
      </div>
      <button
        type="button"
        onClick={() => void download()}
        disabled={downloading}
        className="text-primary hover:bg-accent flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-medium disabled:cursor-default disabled:opacity-70"
      >
        {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {downloading ? 'Downloading…' : 'Download'}
      </button>
      <button
        type="button"
        onClick={dismiss}
        disabled={downloading}
        aria-label="Dismiss"
        className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 cursor-pointer rounded-md p-1 disabled:cursor-default disabled:opacity-70"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
