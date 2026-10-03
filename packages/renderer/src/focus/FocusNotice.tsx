import { useEffect } from 'react';
import { Timer, X } from 'lucide-react';
import { FOCUS_ENDED_MESSAGE } from './focus-notification';

// Long enough to notice after looking up from the page; the reader can close it sooner.
const VISIBLE_MS = 10_000;

interface FocusNoticeProps {
  /** Changes each time a Focus timer runs out, so back-to-back run-outs each get their full time; null hides the notice. */
  noticeId: number | null;
  onDismiss: () => void;
}

/** The in-app notice that a Focus timer ran out, shown over whichever view is open. */
export function FocusNotice({ noticeId, onDismiss }: FocusNoticeProps) {
  useEffect(() => {
    if (noticeId === null) return;
    const timer = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [noticeId, onDismiss]);

  if (noticeId === null) return null;
  return (
    <div
      role="status"
      className="bg-card text-card-foreground fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border py-2 pr-2 pl-4 text-sm shadow-lg"
    >
      <Timer className="text-muted-foreground size-4 shrink-0" />
      <span>{FOCUS_ENDED_MESSAGE}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 cursor-pointer rounded-md p-1"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
