import type { FocusEffect, Result } from '@taking-book/core';
import type { AmbientSoundFailure } from './ambient-sound-failure';
import type { AmbientSoundOperation, AmbientSoundPlayer } from './ambient-sound-player';
import { playFocusChime } from './chime';
import { notifyFocusEndedIfUnfocused } from './focus-notification';

export interface FocusEffectHandlers {
  player: AmbientSoundPlayer;
  /** The Ambient sound the state holds after the transition, named in failure reports. */
  soundId: string | null;
  showNotice: () => void;
  onSoundFailure: (failure: AmbientSoundFailure) => void;
}

function reportIfFailed(result: Result<void, unknown>, operation: AmbientSoundOperation, handlers: FocusEffectHandlers): void {
  if (!result.ok) handlers.onSoundFailure({ soundId: handlers.soundId, operation, error: result.error });
}

/** Carries out one effect of a focus transition on the desktop: chime, notices, and Ambient sound playback. */
export function carryOutFocusEffect(effect: FocusEffect, handlers: FocusEffectHandlers): void {
  switch (effect.type) {
    case 'chime':
      playFocusChime();
      return;
    case 'notify':
      handlers.showNotice();
      notifyFocusEndedIfUnfocused();
      return;
    case 'play-sound':
      void handlers.player.play(effect.soundId, effect.volume).then((result) => {
        if (!result.ok) handlers.onSoundFailure({ soundId: effect.soundId, operation: 'play', error: result.error });
      });
      return;
    case 'stop-sound':
      reportIfFailed(handlers.player.stop(), 'stop', handlers);
      return;
    case 'pause-sound':
      reportIfFailed(handlers.player.pause(), 'pause', handlers);
      return;
    case 'resume-sound':
      reportIfFailed(handlers.player.resume(), 'resume', handlers);
      return;
    case 'fade-out-sound':
      reportIfFailed(handlers.player.fadeOut(), 'fade-out', handlers);
      return;
    case 'set-volume':
      reportIfFailed(handlers.player.setVolume(effect.volume), 'set-volume', handlers);
      return;
  }
}
