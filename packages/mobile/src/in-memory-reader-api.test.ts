import { describe, expect, it } from 'vitest';
import { createInMemoryReaderApi } from './in-memory-reader-api';

describe('createInMemoryReaderApi', () => {
  it('turns every capability off', () => {
    const { capabilities } = createInMemoryReaderApi();
    expect(Object.values(capabilities).every((enabled) => enabled === false)).toBe(true);
    expect(Object.keys(capabilities).sort()).toEqual(
      ['ambientSound', 'dropImport', 'focusTimer', 'fullScreen', 'quiz', 'statistics'],
    );
  });

  it('starts with an empty library', async () => {
    const api = createInMemoryReaderApi();
    expect(await api.listFiles()).toEqual({ ok: true, data: [] });
    expect(await api.listLibraryAnnotations()).toEqual({ ok: true, data: [] });
  });

  it('remembers the theme until the app restarts', async () => {
    const api = createInMemoryReaderApi();
    expect(await api.getTheme()).toEqual({ ok: true, data: 'system' });
    await api.setTheme('dark');
    expect(await api.getTheme()).toEqual({ ok: true, data: 'dark' });
  });

  it('reports that adding a PDF is not available yet instead of throwing', async () => {
    const api = createInMemoryReaderApi();
    const result = await api.openFile();
    expect(result.ok).toBe(false);
  });
});
