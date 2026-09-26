import { describe, expect, it } from 'vitest';
import {
  AMBIENT_SOUNDS,
  MAX_CUSTOM_SOUND_BYTES,
  createCustomSound,
  defaultCustomSoundName,
  listAmbientSounds,
  parseCustomSoundName,
  resolveSoundChoice,
  validateCustomSoundFile,
  type CustomSound,
} from '../src';

const HASH = 'a'.repeat(64);

function makeCustomSound(overrides: Partial<CustomSound> = {}): CustomSound {
  return { contentHash: HASH, name: 'Cafe', ...overrides };
}

describe('validateCustomSoundFile', () => {
  it('accepts a normal file', () => {
    expect(validateCustomSoundFile({ sizeBytes: 1024 })).toEqual({ ok: true, data: 1024 });
  });

  it('accepts a file of exactly the limit', () => {
    expect(validateCustomSoundFile({ sizeBytes: MAX_CUSTOM_SOUND_BYTES }).ok).toBe(true);
  });

  it('rejects a file over the limit', () => {
    expect(validateCustomSoundFile({ sizeBytes: MAX_CUSTOM_SOUND_BYTES + 1 })).toEqual({ ok: false, error: 'file-too-large' });
  });

  it.each([0, -1, Number.NaN])('rejects an empty or invalid size %s', (sizeBytes) => {
    expect(validateCustomSoundFile({ sizeBytes })).toEqual({ ok: false, error: 'empty-file' });
  });
});

describe('defaultCustomSoundName', () => {
  it.each([
    ['rainy-cafe.mp3', 'rainy-cafe'],
    ['/home/me/Music/Deep Focus.FLAC', 'Deep Focus'],
    ['C:\\Users\\me\\night.walk.ogg', 'night.walk'],
    ['noextension', 'noextension'],
    ['.mp3', 'Custom sound'],
  ])('names %s as %s', (path, expected) => {
    expect(defaultCustomSoundName(path)).toBe(expected);
  });
});

describe('parseCustomSoundName', () => {
  it('trims the name', () => {
    expect(parseCustomSoundName('  Cafe  ')).toEqual({ ok: true, data: 'Cafe' });
  });

  it('rejects a blank name', () => {
    expect(parseCustomSoundName('   ')).toEqual({ ok: false, error: 'invalid-name' });
  });

  it('rejects a name longer than the limit', () => {
    expect(parseCustomSoundName('x'.repeat(61))).toEqual({ ok: false, error: 'invalid-name' });
  });
});

describe('createCustomSound', () => {
  it('turns a Custom sound into an Ambient sound keyed by its content hash', () => {
    expect(createCustomSound(makeCustomSound())).toEqual({ id: `custom-${HASH}`, kind: 'custom', name: 'Cafe' });
  });
});

describe('listAmbientSounds', () => {
  it('lists bundled sounds first, then Custom sounds in the order given', () => {
    const other = makeCustomSound({ contentHash: 'b'.repeat(64), name: 'Trains' });
    const sounds = listAmbientSounds([makeCustomSound(), other]);
    expect(sounds.slice(0, AMBIENT_SOUNDS.length)).toEqual(AMBIENT_SOUNDS);
    expect(sounds.slice(AMBIENT_SOUNDS.length).map((sound) => sound.name)).toEqual(['Cafe', 'Trains']);
  });

  it('is just the bundled sounds when there are no Custom sounds', () => {
    expect(listAmbientSounds([])).toEqual(AMBIENT_SOUNDS);
  });
});

describe('resolveSoundChoice', () => {
  it('keeps a bundled sound', () => {
    expect(resolveSoundChoice('rain', [])).toBe('rain');
  });

  it('keeps a Custom sound that still exists', () => {
    expect(resolveSoundChoice(`custom-${HASH}`, [makeCustomSound()])).toBe(`custom-${HASH}`);
  });

  it('falls back to none for a deleted Custom sound', () => {
    expect(resolveSoundChoice(`custom-${HASH}`, [])).toBeNull();
  });

  it('falls back to none for null and unknown ids', () => {
    expect(resolveSoundChoice(null, [])).toBeNull();
    expect(resolveSoundChoice('nope', [])).toBeNull();
  });
});
