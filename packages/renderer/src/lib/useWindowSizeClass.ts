import { useSyncExternalStore } from 'react';
import { classifyWindowWidth, type WindowSizeClass } from './window-size-class';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function readWindowSizeClass(): WindowSizeClass {
  return classifyWindowWidth(window.innerWidth);
}

/**
 * The current Window size class, derived from the real window width. It
 * updates live on resize or rotation, without a reload, and re-renders the
 * caller only when the class itself changes, not on every pixel of a drag.
 */
export function useWindowSizeClass(): WindowSizeClass {
  return useSyncExternalStore(subscribe, readWindowSizeClass, readWindowSizeClass);
}
