import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AMBIENT_SOUNDS } from '@taking-book/core';
import manifest from './sounds/manifest.json';
import { findProvenanceProblems, type SoundProvenance } from './sound-provenance';

const SOUNDS_DIR = path.join(__dirname, 'sounds');

function entry(overrides: Partial<SoundProvenance> = {}): SoundProvenance {
  return {
    file: 'rain.opus',
    sourceUrl: 'https://freesound.org/people/x/sounds/1/',
    author: 'x',
    licence: 'CC0 1.0',
    downloadedOn: '2026-09-26',
    ...overrides,
  };
}

describe('findProvenanceProblems', () => {
  it('reports nothing for a listed CC0 file', () => {
    expect(findProvenanceProblems({ files: ['rain.opus'], manifest: [entry()] })).toEqual([]);
  });

  it('reports a bundled file that is not in the manifest', () => {
    expect(findProvenanceProblems({ files: ['rain.opus', 'fire.opus'], manifest: [entry()] })).toEqual([
      'fire.opus is bundled but missing from the manifest',
    ]);
  });

  it('reports a manifest entry whose file does not exist', () => {
    expect(findProvenanceProblems({ files: [], manifest: [entry()] })).toEqual([
      'rain.opus is in the manifest but no such file is bundled',
    ]);
  });

  it.each(['CC BY 4.0', 'CC BY-NC 3.0', 'Pixabay Content Licence'])('reports the disallowed licence %s', (licence) => {
    expect(findProvenanceProblems({ files: ['rain.opus'], manifest: [entry({ licence })] })).toEqual([
      `rain.opus has licence "${licence}", only CC0 or public domain may be bundled`,
    ]);
  });

  it('accepts public domain', () => {
    expect(findProvenanceProblems({ files: ['rain.opus'], manifest: [entry({ licence: 'Public domain' })] })).toEqual([]);
  });

  it('reports an entry with no source URL, author or download date', () => {
    const problems = findProvenanceProblems({ files: ['rain.opus'], manifest: [entry({ sourceUrl: '', author: '', downloadedOn: '' })] });
    expect(problems).toHaveLength(3);
  });
});

describe('bundled Ambient sounds', () => {
  it('has a manifest entry for every bundled file, and only CC0 or public domain', () => {
    const files = readdirSync(SOUNDS_DIR).filter((name) => name !== 'manifest.json');
    expect(findProvenanceProblems({ files, manifest })).toEqual([]);
  });

  it('has a bundled file for every nature sound in the core catalog', () => {
    const files = readdirSync(SOUNDS_DIR);
    const missing = AMBIENT_SOUNDS.filter((sound) => sound.kind === 'nature' && !files.includes(`${sound.id}.opus`));
    expect(missing.map((sound) => sound.id)).toEqual([]);
  });

  it('has a bundled file listed in the manifest for every instrumental track id in the core catalog', () => {
    const listed = new Set(manifest.map((entry) => entry.file));
    const trackFiles = AMBIENT_SOUNDS.flatMap((sound) => sound.trackIds ?? []).map((trackId) => `${trackId}.opus`);
    expect(trackFiles.length).toBeGreaterThan(0);
    expect(trackFiles.filter((file) => !listed.has(file) || !existsSync(path.join(SOUNDS_DIR, file)))).toEqual([]);
  });
});
