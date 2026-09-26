import { err, ok, type Result } from '@taking-book/core';
import type { AmbientSoundPlayer } from './ambient-sound-player';
import { getAudioContext, resumeAudioContext } from './audio-context';
import { getNoiseColor, startNoise, type PlayingNoise } from './noise';

// Short enough to feel live while dragging the slider, long enough to avoid zipper noise.
const VOLUME_SMOOTHING_S = 0.03;
// A sound eases in rather than bursting on, and eases out so stopping or switching never clicks.
const FADE_IN_S = 1.5;
const FADE_OUT_S = 0.3;

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

/** An Ambient sound player that generates the noise colors with Web Audio. */
export function createWebAudioSoundPlayer(): AmbientSoundPlayer {
  let output: GainNode | null = null;
  let playing: PlayingNoise | null = null;
  let volume = 0;

  const getOutput = (audio: AudioContext): GainNode => {
    if (output === null) {
      output = audio.createGain();
      output.connect(audio.destination);
    }
    return output;
  };

  const stopPlaying = (): void => {
    if (playing === null) return;
    const { source, envelope } = playing;
    playing = null;
    const now = envelope.context.currentTime;
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setValueAtTime(envelope.gain.value, now);
    envelope.gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
    source.onended = () => envelope.disconnect();
    source.stop(now + FADE_OUT_S);
  };

  const startSound = (soundId: string): PlayingNoise => {
    const color = getNoiseColor(soundId);
    if (color === null) throw new Error(`No audio for Ambient sound "${soundId}"`);
    const audio = getAudioContext();
    const out = getOutput(audio);
    out.gain.cancelScheduledValues(audio.currentTime);
    out.gain.setValueAtTime(toGain(volume), audio.currentTime);
    const noise = startNoise(audio, color, out);
    noise.envelope.gain.setValueAtTime(0, audio.currentTime);
    noise.envelope.gain.linearRampToValueAtTime(1, audio.currentTime + FADE_IN_S);
    return noise;
  };

  return {
    play: async (soundId, nextVolume) => {
      volume = nextVolume;
      let started: PlayingNoise | null = null;
      try {
        stopPlaying();
        started = startSound(soundId);
        playing = started;
        await resumeAudioContext(getAudioContext());
        return ok(undefined);
      } catch (error) {
        // Only silence this call's own sound: a later play may have replaced it already.
        if (started !== null && playing === started) stopPlaying();
        return err(error);
      }
    },
    stop: () => tryRun(stopPlaying),
    setVolume: (nextVolume) =>
      tryRun(() => {
        volume = nextVolume;
        if (output === null) return;
        output.gain.setTargetAtTime(toGain(volume), output.context.currentTime, VOLUME_SMOOTHING_S);
      }),
  };
}
