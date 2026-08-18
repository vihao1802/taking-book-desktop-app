import { useEffect, useRef } from 'react';

const FLUSH_INTERVAL_MS = 60_000;

/**
 * Records reading time for a file while the reader is mounted. Elapsed minutes
 * are flushed every minute (so a crash loses at most one minute) and once on
 * unmount. Kept in its own hook so both the page and reflow readers reuse it.
 */
export function useReadingSession(fileId: number): void {
  const lastFlushRef = useRef<number>(Date.now());

  useEffect(() => {
    const flush = () => {
      const now = Date.now();
      const minutes = (now - lastFlushRef.current) / 60_000;
      if (minutes <= 0) return;
      lastFlushRef.current = now;
      window.api.recordReadingSession(fileId, minutes);
    };

    const timer = window.setInterval(flush, FLUSH_INTERVAL_MS);
    const flushOnClose = () => flush();
    window.addEventListener('beforeunload', flushOnClose);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', flushOnClose);
      flush();
    };
  }, [fileId]);
}