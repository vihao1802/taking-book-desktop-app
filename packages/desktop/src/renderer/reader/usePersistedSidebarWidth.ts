import { useEffect, useRef, useState } from 'react';
import { isOk } from '@taking-book/core';
import { SIDEBAR_MIN_WIDTH, clampSidebarWidth } from './sidebar-width';

const SAVE_DELAY_MS = 400;

/**
 * Width of the reader sidebar, restored from and saved to app settings. It is
 * owned by the reader (not the sidebar itself) because the sidebar unmounts
 * when closed and would otherwise re-read the setting, flashing from the
 * default width, every time it opens.
 *
 * @returns The current width in pixels and its setter, which clamps to the allowed range.
 */
export function usePersistedSidebarWidth(): [number, (width: number) => void] {
  const [width, setWidthState] = useState(SIDEBAR_MIN_WIDTH);
  // Saving before the stored value has been read would overwrite it with the
  // default if the reader is closed early.
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    window.api.getSidebarWidth().then((res) => {
      if (cancelled) return;
      if (!isOk(res)) {
        console.error('Failed to load sidebar width', res.error);
        return;
      }
      loadedRef.current = true;
      if (res.data !== null) setWidthState(clampSidebarWidth(res.data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      window.api.setSidebarWidth(width).then((res) => {
        if (!isOk(res)) console.error('Failed to save sidebar width', res.error);
      });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [width]);

  const setWidth = (next: number): void => setWidthState(clampSidebarWidth(next));

  return [width, setWidth];
}
