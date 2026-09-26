import { getAmbientSound } from '@taking-book/core';
import { getBundledSoundUrl } from './nature-recordings';
import type { PlayingSound } from './playing-sound';

/** The bundled track URLs of an instrumental style, in play order, or null when the sound is not an instrumental style. */
export function getPlaylistUrls(soundId: string): string[] | null {
  const trackIds = getAmbientSound(soundId)?.trackIds;
  if (trackIds === undefined) return null;
  return trackIds.map((trackId) => {
    const url = getBundledSoundUrl(trackId);
    if (url === null) throw new Error(`No bundled file for track "${trackId}" of "${soundId}"`);
    return url;
  });
}

/**
 * Starts an instrumental style: its tracks play in order and the last leads
 * back into the first, until stopped. Tracks stream from a media element,
 * because decoding minutes of stereo music into memory would cost hundreds of MB.
 * Resolves once the first track is playing, and rejects if it cannot play.
 */
export async function startPlaylist(audio: AudioContext, urls: string[], destination: AudioNode): Promise<PlayingSound> {
  const element = new Audio();
  const envelope = audio.createGain();
  envelope.gain.value = 0;
  audio.createMediaElementSource(element).connect(envelope).connect(destination);
  let index = 0;
  let failuresInARow = 0;
  let stopped = false;

  const playCurrent = async (): Promise<void> => {
    element.src = urls[index];
    await element.play();
  };
  const playNext = (): void => {
    index = (index + 1) % urls.length;
    playCurrent().then(
      () => (failuresInARow = 0),
      (error: unknown) => {
        if (stopped) return;
        // One unreadable track is skipped; when every track has failed in a row there is nothing left to play.
        console.error(`Ambient sound track "${urls[index]}" failed to play`, error);
        if (++failuresInARow < urls.length) playNext();
      },
    );
  };
  element.addEventListener('ended', playNext);

  await playCurrent();
  return {
    envelope,
    stop: (atTime, onEnded) => {
      stopped = true;
      window.setTimeout(() => {
        element.pause();
        element.removeAttribute('src');
        element.load();
        onEnded();
      }, Math.max(0, atTime - audio.currentTime) * 1000);
    },
  };
}
