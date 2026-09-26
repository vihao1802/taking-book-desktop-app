/** A sound that is playing through the player's output: ramp the envelope to fade it, `stop` to end it. */
export interface PlayingSound {
  envelope: GainNode;
  /** Ends the sound at an AudioContext time (a time already past ends it now), then calls `onEnded`. */
  stop: (atTime: number, onEnded: () => void) => void;
}

/** Ends a buffer source at an AudioContext time, then reports it once it has actually stopped. */
export function stopSource(source: AudioBufferSourceNode, atTime: number, onEnded: () => void): void {
  source.onended = onEnded;
  source.stop(atTime);
}
