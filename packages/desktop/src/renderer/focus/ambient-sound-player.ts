import type { Result } from '@taking-book/core';

/** What the player was doing when an Ambient sound failed, for the error log. */
export type AmbientSoundOperation = 'play' | 'stop' | 'pause' | 'resume' | 'fade-out' | 'set-volume';

/**
 * Plays Ambient sound for the Focus controls. One sound plays at a time;
 * failures come back as the original error, never thrown, so an audio problem
 * can't reach the Focus timer or the reader.
 */
export interface AmbientSoundPlayer {
  /** Plays a sound from the catalog at a volume from 0 to 1, replacing any sound already playing. */
  play: (soundId: string, volume: number) => Promise<Result<void, unknown>>;
  stop: () => Result<void, unknown>;
  /** Silences the playing sound without ending it, until `resume`. */
  pause: () => Result<void, unknown>;
  resume: () => Result<void, unknown>;
  /** Ends the playing sound with a gentle fade of a few seconds instead of cutting it off. */
  fadeOut: () => Result<void, unknown>;
  /** Changes the level of the playing sound live, and of any sound played later. */
  setVolume: (volume: number) => Result<void, unknown>;
}
