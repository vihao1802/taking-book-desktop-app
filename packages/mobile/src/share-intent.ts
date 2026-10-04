import { registerPlugin } from '@capacitor/core';
import { err, ok, type Result } from '@taking-book/core';

/** A file another app shared to Taking Book, as the native plugin describes it. */
export interface SharedFile {
  /** The content URI; valid only while the app handles the share. */
  uri: string;
  name: string;
  /** The type the sending app declared; null when it declared none. */
  mimeType: string | null;
}

/** Where shared files come from. */
export interface ShareSource {
  /** Returns the files shared since the last call and forgets them. */
  takePending(): Promise<Result<SharedFile[]>>;
  /** Listens for files shared while the app runs; returns the unsubscribe. */
  onReceived(listener: () => void): () => void;
}

interface ShareIntentPlugin {
  takePendingShares(): Promise<{ files: SharedFile[] }>;
  addListener(eventName: 'sharesReceived', listener: () => void): Promise<{ remove: () => Promise<void> }>;
}

// Implemented natively by ShareIntentPlugin.java; there is no web fallback.
const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent');

/** The share source backed by the native ShareIntent plugin. */
export function createShareSource(): ShareSource {
  return {
    takePending: async () => {
      try {
        return ok((await ShareIntent.takePendingShares()).files);
      } catch (error) {
        console.error(`Could not read the shared files: ${error instanceof Error ? error.message : String(error)}`);
        return err('The shared files could not be read.');
      }
    },
    onReceived: (listener) => {
      const registration = ShareIntent.addListener('sharesReceived', listener);
      return () => {
        void registration.then((handle) => handle.remove());
      };
    },
  };
}
