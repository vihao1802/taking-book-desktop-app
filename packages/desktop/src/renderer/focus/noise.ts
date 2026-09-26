export type NoiseColor = 'white' | 'pink' | 'brown';

const NOISE_COLOR_BY_SOUND_ID: Record<string, NoiseColor> = {
  'white-noise': 'white',
  'pink-noise': 'pink',
  'brown-noise': 'brown',
};

/** The noise color an Ambient sound id is generated as, or null when the sound is not a noise color. */
export function getNoiseColor(soundId: string): NoiseColor | null {
  return NOISE_COLOR_BY_SOUND_ID[soundId] ?? null;
}

// Long enough that the loop of random samples never repeats audibly.
const NOISE_BUFFER_SECONDS = 8;

interface NoiseFilter {
  feedforward: number[];
  feedback: number[];
}

// Pink: a 3-pole/3-zero approximation of a -3 dB/octave slope (J. O. Smith,
// "Spectral Audio Signal Processing", CCRMA). Brown: a leaky integrator, a
// -6 dB/octave slope that doesn't drift the way a pure integrator does.
const NOISE_FILTERS: Record<NoiseColor, NoiseFilter | null> = {
  white: null,
  pink: {
    feedforward: [0.049922035, -0.095993537, 0.050612699, -0.004408786],
    feedback: [1, -2.494956002, 2.017265875, -0.5221894],
  },
  brown: { feedforward: [0.02], feedback: [1, -0.98] },
};

// Measured so the three colors come out at a similar level with peaks well
// under clipping; the filters leave pink and brown far quieter than white.
// White sits a little below the others, since its remaining treble still reads as loud.
const NOISE_LEVELS: Record<NoiseColor, number> = { white: 0.36, pink: 3.2, brown: 3.2 };

// Every color is rolled off above this, so none has the harsh hiss of raw noise near the top of hearing.
const SOFTEN_ABOVE_HZ = 7000;

const whiteNoiseBuffers = new WeakMap<AudioContext, AudioBuffer>();

function getWhiteNoiseBuffer(audio: AudioContext): AudioBuffer {
  const cached = whiteNoiseBuffers.get(audio);
  if (cached) return cached;
  const buffer = audio.createBuffer(1, audio.sampleRate * NOISE_BUFFER_SECONDS, audio.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  whiteNoiseBuffers.set(audio, buffer);
  return buffer;
}

/** A playing noise: stop the source to end it, ramp the envelope to fade it. */
export interface PlayingNoise {
  source: AudioBufferSourceNode;
  envelope: GainNode;
}

/**
 * Starts a noise color playing into `destination`, silent until its envelope
 * is raised: looped white noise, shaped by a filter for pink and brown, then
 * softened at the top.
 */
export function startNoise(audio: AudioContext, color: NoiseColor, destination: AudioNode): PlayingNoise {
  const source = audio.createBufferSource();
  source.buffer = getWhiteNoiseBuffer(audio);
  source.loop = true;
  const filter = NOISE_FILTERS[color];
  const shaped = filter ? source.connect(audio.createIIRFilter(filter.feedforward, filter.feedback)) : source;
  const soften = audio.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = SOFTEN_ABOVE_HZ;
  const level = audio.createGain();
  level.gain.value = NOISE_LEVELS[color];
  const envelope = audio.createGain();
  envelope.gain.value = 0;
  shaped.connect(soften).connect(level).connect(envelope).connect(destination);
  source.start();
  return { source, envelope };
}
