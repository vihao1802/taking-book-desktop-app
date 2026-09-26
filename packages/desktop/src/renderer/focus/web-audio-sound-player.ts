import { err, ok, type Result } from '@taking-book/core';
import type { AmbientSoundPlayer } from './ambient-sound-player';
import { getAudioContext, resumeAudioContext } from './audio-context';
import { getPlaylistUrls, startPlaylist } from './instrumental-playlist';
import { getBundledSoundUrl, loadRecording, startRecording } from './nature-recordings';
import { getNoiseColor, startNoise } from './noise';
import type { PlayingSound } from './playing-sound';

// Short enough to feel live while dragging the slider, long enough to avoid zipper noise.
const VOLUME_SMOOTHING_S = 0.03;
// A sound eases in rather than bursting on, and eases out so stopping or switching never clicks.
const FADE_IN_S = 1.5;
const FADE_OUT_S = 0.3;
// Ending a Focus block fades the sound out slowly, so the end of a session is felt rather than heard as a cut.
const FOCUS_END_FADE_OUT_S = 4;
// A pause is quick, so the sound follows the timer, but still ramped so it never clicks.
const PAUSE_FADE_S = 0.2;

// Loudness is heard roughly logarithmically, so a squared curve spreads the slider's range more evenly than a linear gain.
function toGain(volume: number): number {
  return volume * volume;
}

function tryRun(run: () => void): Result<void, unknown> {
  try {
    run();
    return ok(undefined);
  } catch (error) {
    return err(error);
  }
}

/** An Ambient sound player: generates the noise colors, loops the bundled nature recordings and plays the instrumental styles' tracks in turn, all through Web Audio. */
export function createWebAudioSoundPlayer(): AmbientSoundPlayer {
  let output: GainNode | null = null;
  let playing: PlayingSound | null = null;
  let volume = 0;
  let paused = false;
  let fading: PlayingSound | null = null;
  // A recording takes a moment to decode, so a newer play or a stop can arrive first and must win.
  let latestRequest = 0;

  const getOutput = (audio: AudioContext): GainNode => {
    if (output === null) {
      output = audio.createGain();
      output.connect(audio.destination);
    }
    return output;
  };

  const stopPlaying = (fadeS: number = FADE_OUT_S): void => {
    if (playing === null) return;
    const ending = playing;
    const { envelope } = ending;
    fading = fadeS > FADE_OUT_S ? ending : null;
    playing = null;
    const now = envelope.context.currentTime;
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setValueAtTime(envelope.gain.value, now);
    envelope.gain.linearRampToValueAtTime(0, now + fadeS);
    ending.stop(now + fadeS, () => {
      envelope.disconnect();
      if (fading === ending) fading = null;
    });
  };

  // The shared output gain is about to jump back to full volume, so a slow fade-out still running would swell under the new sound.
  const cutOffFade = (): void => {
    if (fading === null) return;
    const { envelope } = fading;
    fading.stop(0, () => undefined);
    fading = null;
    envelope.disconnect();
  };

  const startSound = async (soundId: string, recording: AudioBuffer | null): Promise<PlayingSound> => {
    cutOffFade();
    const audio = getAudioContext();
    const out = getOutput(audio);
    out.gain.cancelScheduledValues(audio.currentTime);
    out.gain.setValueAtTime(paused ? 0 : toGain(volume), audio.currentTime);
    const color = getNoiseColor(soundId);
    const playlist = getPlaylistUrls(soundId);
    let sound: PlayingSound;
    if (recording !== null) sound = startRecording(audio, recording, out);
    else if (color !== null) sound = startNoise(audio, color, out);
    else if (playlist !== null) sound = await startPlaylist(audio, playlist, out);
    else throw new Error(`No audio for Ambient sound "${soundId}"`);
    sound.envelope.gain.setValueAtTime(0, audio.currentTime);
    sound.envelope.gain.linearRampToValueAtTime(1, audio.currentTime + FADE_IN_S);
    return sound;
  };

  return {
    play: async (soundId, nextVolume) => {
      volume = nextVolume;
      paused = false;
      const request = ++latestRequest;
      let started: PlayingSound | null = null;
      try {
        stopPlaying();
        const recording = getBundledSoundUrl(soundId) === null ? null : await loadRecording(getAudioContext(), soundId);
        if (request !== latestRequest) return ok(undefined);
        await resumeAudioContext(getAudioContext());
        started = await startSound(soundId, recording);
        if (request !== latestRequest) {
          started.stop(0, () => started?.envelope.disconnect());
          return ok(undefined);
        }
        playing = started;
        return ok(undefined);
      } catch (error) {
        // Only silence this call's own sound: a later play may have replaced it already.
        if (started !== null && playing === started) stopPlaying();
        return err(error);
      }
    },
    stop: () =>
      tryRun(() => {
        latestRequest++;
        stopPlaying();
      }),
    pause: () =>
      tryRun(() => {
        paused = true;
        if (output === null) return;
        output.gain.setTargetAtTime(0, output.context.currentTime, PAUSE_FADE_S / 3);
      }),
    resume: () =>
      tryRun(() => {
        paused = false;
        if (output === null) return;
        output.gain.setTargetAtTime(toGain(volume), output.context.currentTime, PAUSE_FADE_S / 3);
      }),
    fadeOut: () =>
      tryRun(() => {
        latestRequest++;
        stopPlaying(FOCUS_END_FADE_OUT_S);
      }),
    setVolume: (nextVolume) =>
      tryRun(() => {
        volume = nextVolume;
        // A paused sound stays silent: the new level is heard on resume.
        if (output === null || paused) return;
        output.gain.setTargetAtTime(toGain(volume), output.context.currentTime, VOLUME_SMOOTHING_S);
      }),
  };
}
