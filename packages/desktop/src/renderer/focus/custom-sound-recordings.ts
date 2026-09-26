import { crossfadeLoop, getCustomSoundHash } from '@taking-book/core';

// The same seam blend the bundled recordings were encoded with, so a Custom sound loops as smoothly.
const LOOP_CROSSFADE_S = 1.5;

const decodedSounds = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer>>>();

/** The `appfile://` URL the main process serves a stored Custom sound's audio from. */
export function getCustomSoundUrl(contentHash: string): string {
  return `appfile://sound/${contentHash}`;
}

/** Whether an Ambient sound id belongs to a Custom sound. */
export function isCustomSoundId(soundId: string): boolean {
  return getCustomSoundHash(soundId) !== null;
}

async function decodeCustomSound(audio: AudioContext, contentHash: string): Promise<AudioBuffer> {
  const response = await fetch(getCustomSoundUrl(contentHash));
  if (!response.ok) throw new Error(`Could not load the Custom sound ${contentHash} (HTTP ${response.status})`);
  return makeLoopable(audio, await audio.decodeAudioData(await response.arrayBuffer()));
}

// Blends the end of each channel into its start, so the looped buffer has no click where it wraps.
function makeLoopable(audio: AudioContext, decoded: AudioBuffer): AudioBuffer {
  const fadeSamples = Math.round(LOOP_CROSSFADE_S * decoded.sampleRate);
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => crossfadeLoop(decoded.getChannelData(index), fadeSamples));
  const looped = audio.createBuffer(channels.length, channels[0].length, decoded.sampleRate);
  channels.forEach((channel, index) => looped.copyToChannel(channel, index));
  return looped;
}

/**
 * Loads, decodes and prepares a Custom sound for looping. A decoded sound is
 * kept, so choosing it again starts at once; a failed load is not kept, so it
 * can be retried. Rejects when the file is not audio the app can decode.
 */
export function loadCustomSound(audio: AudioContext, contentHash: string): Promise<AudioBuffer> {
  const cache = decodedSounds.get(audio) ?? new Map<string, Promise<AudioBuffer>>();
  decodedSounds.set(audio, cache);
  const cached = cache.get(contentHash);
  if (cached) return cached;
  const loading = decodeCustomSound(audio, contentHash);
  cache.set(contentHash, loading);
  loading.catch(() => cache.delete(contentHash));
  return loading;
}

/** Forgets a decoded Custom sound, so its memory is freed once the sound is deleted. */
export function releaseCustomSound(audio: AudioContext, contentHash: string): void {
  decodedSounds.get(audio)?.delete(contentHash);
}
