import { Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeUpdateStatus } from '@/updates/update-status';
import { useManualUpdateCheck } from '@/updates/useManualUpdateCheck';

/**
 * The running version plus a way to check for, and download, a newer release
 * on demand, so a dismissed Update notice is never the only way to update.
 */
export function AboutSettings() {
  const { currentVersion, status, linkError, check, download, openAllReleases } = useManualUpdateCheck();
  const checking = status.kind === 'checking';
  const message = describeUpdateStatus(status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>About & updates</CardTitle>
        <CardDescription>
          {currentVersion ? `Taking Book ${currentVersion}` : 'Taking Book'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Taking Book is a local-first reading app. Your library and reading
          progress live on this device and sync to your cloud drive.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void check()} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Check for updates
          </Button>
          {(status.kind === 'available' || status.kind === 'downloading') && (
            <Button onClick={() => void download()} disabled={status.kind === 'downloading'}>
              {status.kind === 'downloading' ? <Loader2 className="animate-spin" /> : <Download />}
              {status.kind === 'downloading' ? 'Downloading…' : `Download ${status.update.version}`}
            </Button>
          )}
          <Button variant="link" onClick={() => void openAllReleases()}>
            All releases
            <ExternalLink />
          </Button>
        </div>
        {message && (
          <p role="status" className="text-muted-foreground">
            {message}
          </p>
        )}
        {linkError && <p className="text-destructive">{linkError}</p>}
      </CardContent>
    </Card>
  );
}
