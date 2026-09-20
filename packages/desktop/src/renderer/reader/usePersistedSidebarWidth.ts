import { useEffect, useRef, useState } from 'react';
import { isOk, type Result } from '@taking-book/core';
import { NOTES_SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, clampSidebarWidth } from './sidebar-width';

const SAVE_DELAY_MS = 400;

/** Which reader panel a persisted width belongs to; each keeps its own. */
export type SidebarWidthPanel = 'reader' | 'notes';

interface PanelWidthStore {
  defaultWidth: number;
  load: () => Promise<Result<number | null>>;
  save: (width: number) => Promise<Result<void>>;
}

// Looked up lazily so `window.api` is only touched inside the effects.
const PANEL_STORES: Record<SidebarWidthPanel, PanelWidthStore> = {
  reader: {
    defaultWidth: SIDEBAR_MIN_WIDTH,
    load: () => window.api.getSidebarWidth(),
    save: (width) => window.api.setSidebarWidth(width),
  },
  notes: {
    defaultWidth: NOTES_SIDEBAR_DEFAULT_WIDTH,
    load: () => window.api.getNotesSidebarWidth(),
    save: (width) => window.api.setNotesSidebarWidth(width),
  },
};

/**
 * Width of a reader sidebar, restored from and saved to app settings. It is
 * owned by the reader (not the sidebar itself) because the sidebar unmounts
 * when closed and would otherwise re-read the setting, flashing from the
 * default width, every time it opens.
 *
 * @param panel - Which sidebar's width to keep; the Reader and Notes sidebars are remembered separately.
 * @returns The current width in pixels and its setter, which clamps to the allowed range.
 */
export function usePersistedSidebarWidth(panel: SidebarWidthPanel = 'reader'): [number, (width: number) => void] {
  const [width, setWidthState] = useState(PANEL_STORES[panel].defaultWidth);
  // Saving before the stored value has been read would overwrite it with the
  // default if the reader is closed early.
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    PANEL_STORES[panel].load().then((res) => {
      if (cancelled) return;
      if (!isOk(res)) {
        console.error(`Failed to load ${panel} sidebar width`, res.error);
        return;
      }
      loadedRef.current = true;
      if (res.data !== null) setWidthState(clampSidebarWidth(res.data));
    });
    return () => {
      cancelled = true;
    };
  }, [panel]);

  useEffect(() => {
    if (!loadedRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      PANEL_STORES[panel].save(width).then((res) => {
        if (!isOk(res)) console.error(`Failed to save ${panel} sidebar width`, res.error);
      });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [panel, width]);

  const setWidth = (next: number): void => setWidthState(clampSidebarWidth(next));

  return [width, setWidth];
}
