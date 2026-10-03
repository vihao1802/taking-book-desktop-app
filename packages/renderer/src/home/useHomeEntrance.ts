import { useCallback, useEffect, useState } from 'react';
import { createEntranceGate } from '@/lib/entrance-gate';

// Module scope outlives Home, which unmounts whenever another view or a Book
// is shown, so the entrance plays once per app launch rather than once per visit.
const homeEntranceGate = createEntranceGate();

/** What the launchpad needs to ease in; its direct children are what move. */
export interface HomeEntrance {
  className: string | undefined;
  /** Called when the launchpad leaves the screen, e.g. while searching. */
  endEntrance: () => void;
}

/**
 * Whether Home should ease in: only during the first Home visit after launch
 * whose library has loaded. The launchpad plays it the first time it appears in
 * that visit, even if that is when the first Books are added to an empty
 * library. Once the launchpad has been on screen, remounting it (clearing a
 * search) never plays it again, and neither does any later Home visit.
 */
export function useHomeEntrance(ready: boolean): HomeEntrance {
  const [playing, setPlaying] = useState(() => homeEntranceGate.shouldPlay());

  useEffect(() => {
    if (ready) homeEntranceGate.markShown();
  }, [ready]);

  const endEntrance = useCallback((): void => setPlaying(false), []);

  return { className: playing ? 'home-entrance' : undefined, endEntrance };
}
