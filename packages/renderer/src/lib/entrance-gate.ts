/** Decides whether a one-off entrance animation may still play. */
export interface EntranceGate {
  shouldPlay: () => boolean;
  markShown: () => void;
}

/**
 * A gate that stays open until the entrance has been shown once, then stays
 * closed. Asking does not close it, so a render that is thrown away before it
 * reaches the screen does not use up the entrance.
 */
export function createEntranceGate(): EntranceGate {
  let shown = false;
  return {
    shouldPlay: () => !shown,
    markShown: () => {
      shown = true;
    },
  };
}
