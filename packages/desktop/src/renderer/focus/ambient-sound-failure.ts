import { getAmbientSound } from '@taking-book/core';
import type { AmbientSoundOperation } from './ambient-sound-player';

/** An Ambient sound the player could not play, stop or change the volume of. */
export interface AmbientSoundFailure {
  soundId: string | null;
  operation: AmbientSoundOperation;
  error: unknown;
}

/** Logs an Ambient sound failure with the sound id and operation, for diagnosing it later. */
export function logAmbientSoundFailure({ soundId, operation, error }: AmbientSoundFailure): void {
  console.error(`[focus] Ambient sound ${soundId ?? '(none)'} failed during ${operation}`, error);
}

/** The short message the Focus controls show for an Ambient sound failure. */
export function describeAmbientSoundFailure({ soundId, operation }: AmbientSoundFailure): string {
  const name = (soundId === null ? null : getAmbientSound(soundId)?.name) ?? 'the sound';
  switch (operation) {
    case 'play':
      return `Couldn't play ${name}.`;
    case 'stop':
      return `Couldn't stop ${name}.`;
    case 'set-volume':
      return `Couldn't change the volume of ${name}.`;
  }
}
