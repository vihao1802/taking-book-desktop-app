import { describe, expect, it } from 'vitest';
import { describeAmbientSoundFailure } from './ambient-sound-failure';

describe('describeAmbientSoundFailure', () => {
  it('names the sound and what failed', () => {
    const error = new Error('boom');
    expect(describeAmbientSoundFailure({ soundId: 'pink-noise', operation: 'play', error })).toBe("Couldn't play Pink noise.");
    expect(describeAmbientSoundFailure({ soundId: 'brown-noise', operation: 'stop', error })).toBe("Couldn't stop Brown noise.");
    expect(describeAmbientSoundFailure({ soundId: 'white-noise', operation: 'set-volume', error })).toBe("Couldn't change the volume of White noise.");
    expect(describeAmbientSoundFailure({ soundId: 'pink-noise', operation: 'pause', error })).toBe("Couldn't pause Pink noise.");
    expect(describeAmbientSoundFailure({ soundId: 'pink-noise', operation: 'resume', error })).toBe("Couldn't resume Pink noise.");
    expect(describeAmbientSoundFailure({ soundId: 'pink-noise', operation: 'fade-out', error })).toBe("Couldn't stop Pink noise.");
  });

  it('falls back to a generic name for a missing or unknown sound', () => {
    expect(describeAmbientSoundFailure({ soundId: null, operation: 'set-volume', error: null })).toBe("Couldn't change the volume of the sound.");
    expect(describeAmbientSoundFailure({ soundId: 'cafe', operation: 'play', error: null })).toBe("Couldn't play the sound.");
  });
});
