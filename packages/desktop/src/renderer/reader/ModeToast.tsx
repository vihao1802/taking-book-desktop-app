import { useEffect } from 'react';
import type { ReadMode } from '@taking-book/core';

const VISIBLE_MS = 1200;

const MODE_LABELS: Record<ReadMode, string> = {
  page: 'Page view',
  reflow: 'Reflow view',
};

/** A mode switch the reader just made; `id` distinguishes back-to-back switches to the same mode. */
export interface ModeSwitch {
  id: number;
  mode: ReadMode;
}

interface ModeToastProps {
  modeSwitch: ModeSwitch | null;
  onDone: () => void;
}

/**
 * Briefly names the view the reader just switched to. The two views look alike
 * once the text is on screen, so this confirms the switch happened.
 */
export function ModeToast({ modeSwitch, onDone }: ModeToastProps) {
  const id = modeSwitch?.id;

  useEffect(() => {
    if (id === undefined) return;
    const timer = window.setTimeout(onDone, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [id, onDone]);

  if (!modeSwitch) return null;
  return (
    <div
      role="status"
      className="bg-overlay text-foreground pointer-events-none fixed bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-md border px-3 py-1.5 text-sm backdrop-blur-md"
    >
      {MODE_LABELS[modeSwitch.mode]}
    </div>
  );
}
