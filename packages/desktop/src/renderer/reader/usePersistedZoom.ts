import { useEffect, useRef, useState } from 'react';
import { isOk, type ReadMode } from '@taking-book/core';
import { clampZoom } from './Overlay';

const SAVE_DELAY_MS = 400;

/**
 * Zoom multiplier for one reader view, restored from and saved to the book's
 * record. Page and reflow each call this with their own mode, so the two zoom
 * levels never affect each other.
 *
 * @param fileId - The book whose zoom is tracked.
 * @param mode - The reader view this zoom belongs to.
 * @param onRestored - Called with the saved zoom once it has been read, so the
 *   caller can sync any state derived from it (e.g. page mode's fit-to-width).
 * @returns The current zoom (1 = 100%) and its setter.
 */
export function usePersistedZoom(
  fileId: number,
  mode: ReadMode,
  onRestored?: (zoom: number) => void,
): [number, (zoom: number) => void] {
  const [zoom, setZoom] = useState(1);
  // Saving before the stored value has been read would overwrite it with the
  // placeholder 1 if the reader is closed early.
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<number>(0);
  const onRestoredRef = useRef(onRestored);
  onRestoredRef.current = onRestored;

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    window.api.getFileZoom(fileId, mode).then((res) => {
      if (cancelled || !isOk(res)) return;
      loadedRef.current = true;
      if (res.data == null) return;
      const restored = clampZoom(res.data);
      setZoom(restored);
      onRestoredRef.current?.(restored);
    });
    return () => {
      cancelled = true;
    };
  }, [fileId, mode]);

  useEffect(() => {
    if (!loadedRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      window.api.setFileZoom(fileId, zoom, mode);
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [zoom, fileId, mode]);

  return [zoom, setZoom];
}
