import { useCallback, useEffect, useState } from 'react';

export interface FullScreenState {
  fullScreen: boolean;
  toggleFullScreen: () => void;
}

/**
 * Tracks the window's full-screen state. It listens to the main process rather
 * than flipping a local flag so the F11 / View menu path stays in sync too.
 */
export function useFullScreen(): FullScreenState {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api.isFullScreen().then((result) => {
      if (!cancelled && result.ok) setFullScreen(result.data);
    });
    const unsubscribe = window.api.onFullScreenChange(setFullScreen);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const toggleFullScreen = useCallback(() => {
    window.api.toggleFullScreen().then((result) => {
      if (!result.ok) console.error('Failed to toggle full screen:', result.error);
    });
  }, []);

  return { fullScreen, toggleFullScreen };
}
