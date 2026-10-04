import { App } from '@capacitor/app';

/**
 * Reports when the app moves to the foreground or the background.
 *
 * @param listener Called with true when the reader comes back to the app, false when it leaves.
 * @returns A function that stops listening.
 */
export function watchAppActive(listener: (active: boolean) => void): () => void {
  const handle = App.addListener('appStateChange', ({ isActive }) => listener(isActive));
  return () => {
    void handle.then((registered) => registered.remove());
  };
}
