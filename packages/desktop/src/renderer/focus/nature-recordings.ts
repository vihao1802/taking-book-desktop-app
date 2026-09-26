import { stopSource, type PlayingSound } from './playing-sound';

// Vite gives each bundled recording a URL that also works from the packaged app, and keeps them offline.
const RECORDING_URLS = import.meta.glob<string>('./sounds/*.opus', { query: '?url', import: 'default', eager: true });

/** The bundled file URL for a recording or track id, or null when no such file is bundled. */
export function getBundledSoundUrl(fileId: string): string | null {
  return RECORDING_URLS[`./sounds/${fileId}.opus`] ?? null;
}

const decodedRecordings = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer>>>();

async function decodeRecording(audio: AudioContext, soundId: string, url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the recording for "${soundId}" (HTTP ${response.status})`);
  return audio.decodeAudioData(await response.arrayBuffer());
}

/**
 * Loads and decodes a nature recording. A decoded recording is kept, so choosing
 * the sound again starts at once; a failed load is not kept, so it can be retried.
 */
export function loadRecording(audio: AudioContext, soundId: string): Promise<AudioBuffer> {
  const url = getBundledSoundUrl(soundId);
  if (url === null) return Promise.reject(new Error(`No recording for Ambient sound "${soundId}"`));
  const cache = decodedRecordings.get(audio) ?? new Map<string, Promise<AudioBuffer>>();
  decodedRecordings.set(audio, cache);
  const cached = cache.get(soundId);
  if (cached) return cached;
  const loading = decodeRecording(audio, soundId, url);
  cache.set(soundId, loading);
  loading.catch(() => cache.delete(soundId));
  return loading;
}

/**
 * Starts a decoded recording looping into `destination`, silent until its
 * envelope is raised. A buffer source loops sample-accurately, so there is no
 * gap the way an `<audio loop>` element would leave.
 */
export function startRecording(audio: AudioContext, buffer: AudioBuffer, destination: AudioNode): PlayingSound {
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const envelope = audio.createGain();
  envelope.gain.value = 0;
  source.connect(envelope).connect(destination);
  source.start();
  return { envelope, stop: (atTime, onEnded) => stopSource(source, atTime, onEnded) };
}
