/**
 * Makes one channel of audio loop without a click at the seam: the last
 * `fadeSamples` are folded into the start with equal-power gains, so when the
 * loop wraps around the sound carries on from where it left off.
 *
 * @param samples - One channel of decoded audio.
 * @param fadeSamples - How many samples to blend. It is limited to half the audio.
 * @returns A new, shorter channel that is safe to loop; the input is left alone.
 */
export function crossfadeLoop(samples: Float32Array, fadeSamples: number): Float32Array<ArrayBuffer> {
  const fade = Math.min(Math.max(0, Math.floor(fadeSamples)), Math.floor(samples.length / 2));
  if (fade === 0) return samples.slice();
  const loopLength = samples.length - fade;
  const looped = samples.slice(0, loopLength);
  for (let index = 0; index < fade; index++) {
    const angle = (index / fade) * (Math.PI / 2);
    looped[index] = samples[index] * Math.sin(angle) + samples[loopLength + index] * Math.cos(angle);
  }
  return looped;
}
