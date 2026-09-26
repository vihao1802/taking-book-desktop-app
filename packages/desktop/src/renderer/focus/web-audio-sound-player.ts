import { err, ok, type Result } from '@taking-book/core';
import type { AmbientSoundPlayer } from './ambient-sound-player';
import { getAudioContext, resumeAudioContext } from './audio-context';
import { loadRecording, getRecordingUrl, startRecording } from './nature-recordings';
import { getNoiseColor, startNoise, type PlayingNoise } from './noise';

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

/** An Ambient sound player: generates the noise colors and loops the bundled nature recordings, both with Web Audio. */
export function createWebAudioSoundPlayer(): AmbientSoundPlayer {
  let output: GainNode | null = null;
  let playing: PlayingNoise | null = null;
  let volume = 0;
  let paused = false;
  let fading: PlayingNoise | null = null;
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
    const { source, envelope } = playing;
    fading = fadeS > FADE_OUT_S ? playing : null;
    playing = null;
    const now = envelope.context.currentTime;
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setValueAtTime(envelope.gain.value, now);
    envelope.gain.linearRampToValueAtTime(0, now + fadeS);
    source.onended = () => {
      envelope.disconnect();
      if (fading?.source === source) fading = null;
    };
    source.stop(now + fadeS);
  };

  // The shared output gain is about to jump back to full volume, so a slow fade-out still running would swell under the new sound.
  const cutOffFade = (): void => {
    if (fading === null) return;
    const { source, envelope } = fading;
    fading = null;
    source.stop();
    envelope.disconnect();
  };

  const startSound = (soundId: string, recording: AudioBuffer | null): PlayingNoise => {
    cutOffFade();
    const color = getNoiseColor(soundId);
    if (recording === null && color === null) throw new Error(`No audio for Ambient sound "${soundId}"`);
    const audio = getAudioContext();
    const out = getOutput(audio);
    out.gain.cancelScheduledValues(audio.currentTime);
    out.gain.setValueAtTime(paused ? 0 : toGain(volume), audio.currentTime);
    const sound = recording !== null ? startRecording(audio, recording, out) : startNoise(audio, color ?? 'white', out);
    sound.envelope.gain.setValueAtTime(0, audio.currentTime);
    sound.envelope.gain.linearRampToValueAtTime(1, audio.currentTime + FADE_IN_S);
    return sound;
  };

  return {
    play: async (soundId, nextVolume) => {
      volume = nextVolume;
      paused = false;
      const request = ++latestRequest;
      let started: PlayingNoise | null = null;
      try {
        stopPlaying();
        const recording = getRecordingUrl(soundId) === null ? null : await loadRecording(getAudioContext(), soundId);
        if (request !== latestRequest) return ok(undefined);
        started = startSound(soundId, recording);
        playing = started;
        await resumeAudioContext(getAudioContext());
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
