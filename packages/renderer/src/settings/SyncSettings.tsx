import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDownloadOverMobileData } from './useDownloadOverMobileData';

/** Settings section for how PDFs download while syncing on a phone. */
export function SyncSettings() {
  const { allowed, error, choose } = useDownloadOverMobileData();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sync</CardTitle>
        <CardDescription>
          Your Library, reading positions and notes sync on any connection. PDFs download on Wi-Fi unless you allow mobile
          data. This choice stays on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <Button
          variant={allowed ? 'default' : 'outline'}
          className="h-auto justify-between gap-3 py-3"
          role="switch"
          aria-checked={allowed === true}
          aria-label="Download PDFs over mobile data"
          disabled={allowed === null}
          onClick={() => choose(!allowed)}
        >
          <span className="text-sm font-medium">Download PDFs over mobile data</span>
          <span className="text-xs">{allowed ? 'On' : 'Off'}</span>
        </Button>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
