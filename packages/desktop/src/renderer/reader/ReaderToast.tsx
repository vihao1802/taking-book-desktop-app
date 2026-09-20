import { useEffect } from 'react';

const DEFAULT_VISIBLE_MS = 1200;

/** A short message the reader shows; `id` distinguishes back-to-back notices with the same text. */
export interface ReaderNotice {
  id: number;
  message: string;
  /** How long it stays up; defaults to a quick 1.2s for one-word confirmations. */
  visibleMs?: number;
}

interface ReaderToastProps {
  notice: ReaderNotice | null;
  onDone: () => void;
}

/**
 * Briefly shows a notice at the bottom of the reader, such as which view the
 * reader just switched to (the two views look alike once the text is on screen)
 * or that a Note's passage could not be found.
 */
export function ReaderToast({ notice, onDone }: ReaderToastProps) {
  const id = notice?.id;
  const visibleMs = notice?.visibleMs ?? DEFAULT_VISIBLE_MS;

  useEffect(() => {
    if (id === undefined) return;
    const timer = window.setTimeout(onDone, visibleMs);
    return () => window.clearTimeout(timer);
  }, [id, visibleMs, onDone]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className="bg-overlay text-foreground pointer-events-none fixed bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-md border px-3 py-1.5 text-sm backdrop-blur-md"
    >
      {notice.message}
    </div>
  );
}
