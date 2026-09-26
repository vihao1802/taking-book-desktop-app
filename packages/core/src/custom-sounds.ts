/**
 * Custom sound rules, shared by both platforms: the reader's own audio files
 * offered next to the bundled Ambient sounds. Pure logic only. Copying and
 * hashing the file, and checking that it decodes, are up to each platform.
 */
import { AMBIENT_SOUNDS, getAmbientSound, type AmbientSound } from './focus';
import { err, ok, type Result } from './result';

/** Largest audio file accepted as a Custom sound, in bytes. */
export const MAX_CUSTOM_SOUND_BYTES = 50 * 1024 * 1024;

/** Longest display name a Custom sound can have, in characters. */
export const MAX_CUSTOM_SOUND_NAME_LENGTH = 60;

const FALLBACK_CUSTOM_SOUND_NAME = 'Custom sound';

/** Why a Custom sound was rejected: a file with no content, one over the size limit, or an unusable name. */
export type CustomSoundError = 'empty-file' | 'file-too-large' | 'invalid-name';

/** A Custom sound as stored on this device. */
export interface CustomSound {
  /** SHA-256 of the audio content, so the same audio is never added twice. */
  contentHash: string;
  name: string;
}

/**
 * Checks an audio file the reader picked against the size rules.
 *
 * @param file - The file's size in bytes.
 * @returns The size, or `empty-file` / `file-too-large` when the file breaks the rules.
 */
export function validateCustomSoundFile(file: { sizeBytes: number }): Result<number, CustomSoundError> {
  if (!Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0) return err('empty-file');
  if (file.sizeBytes > MAX_CUSTOM_SOUND_BYTES) return err('file-too-large');
  return ok(file.sizeBytes);
}

/**
 * Names a new Custom sound after its file: the file name without folders or extension.
 *
 * @param filePath - The picked file's path, with either kind of separator.
 * @returns The name, or a generic one when the file name has nothing left.
 */
export function defaultCustomSoundName(filePath: string): string {
  const fileName = filePath.split(/[\\/]/).pop() ?? '';
  const lastDot = fileName.lastIndexOf('.');
  const stem = lastDot > 0 ? fileName.slice(0, lastDot) : lastDot === 0 ? '' : fileName;
  const name = stem.trim().slice(0, MAX_CUSTOM_SOUND_NAME_LENGTH);
  return name === '' ? FALLBACK_CUSTOM_SOUND_NAME : name;
}

/**
 * Validates a name the reader typed when renaming a Custom sound.
 *
 * @returns The trimmed name, or `invalid-name` when it is blank or too long.
 */
export function parseCustomSoundName(input: string): Result<string, CustomSoundError> {
  const name = input.trim();
  return name === '' || name.length > MAX_CUSTOM_SOUND_NAME_LENGTH ? err('invalid-name') : ok(name);
}

const CUSTOM_SOUND_ID_PREFIX = 'custom-';

/** The content hash inside a Custom sound's Ambient sound id, or null when the id is not a Custom sound's. */
export function getCustomSoundHash(soundId: string): string | null {
  return soundId.startsWith(CUSTOM_SOUND_ID_PREFIX) && soundId.length > CUSTOM_SOUND_ID_PREFIX.length
    ? soundId.slice(CUSTOM_SOUND_ID_PREFIX.length)
    : null;
}

/** Turns a Custom sound into an Ambient sound, keyed by its content hash so the id stays stable across renames. */
export function createCustomSound(sound: CustomSound): AmbientSound {
  return { id: `${CUSTOM_SOUND_ID_PREFIX}${sound.contentHash}`, kind: 'custom', name: sound.name };
}

/** Every Ambient sound the reader can choose: the bundled ones, then their Custom sounds. */
export function listAmbientSounds(customSounds: CustomSound[]): AmbientSound[] {
  return [...AMBIENT_SOUNDS, ...customSounds.map(createCustomSound)];
}

/**
 * Checks a remembered sound choice against what exists now.
 *
 * @param soundId - The stored id, possibly of a Custom sound deleted since.
 * @returns The id when it is still a sound, otherwise null (no sound chosen).
 */
export function resolveSoundChoice(soundId: string | null, customSounds: CustomSound[]): string | null {
  if (soundId === null) return null;
  if (getAmbientSound(soundId) !== null) return soundId;
  return customSounds.some((sound) => createCustomSound(sound).id === soundId) ? soundId : null;
}
