import { describe, expect, it } from 'vitest';
import {
  getEffectiveTargetLanguage,
  getFocusPreferences,
  getNotesSidebarWidth,
  getSidebarWidth,
  getTargetLanguage,
  getTheme,
  setFocusPreferences,
  setNotesSidebarWidth,
  setSetting,
  setSidebarWidth,
  setTargetLanguage,
  setTheme,
  settingsSchema,
} from '../src';
import { isErr, isOk } from '../src';
import { createMemoryDriver } from './helpers';

describe('settingsRepository', () => {
  it('defaults to the system theme', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    const theme = await getTheme(db);
    expect(isOk(theme) && theme.data === 'system').toBe(true);
  });

  it('persists and reads back a chosen theme', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    await setTheme(db, 'sepia');
    const theme = await getTheme(db);
    expect(isOk(theme) && theme.data === 'sepia').toBe(true);
  });

  it('falls back to system when the stored value is invalid', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());
    await db.run("INSERT INTO settings (key, value) VALUES ('theme', 'neon')");

    const theme = await getTheme(db);
    expect(isOk(theme) && theme.data === 'system').toBe(true);
  });

  it('has no sidebar width until one is saved', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    const width = await getSidebarWidth(db);
    expect(isOk(width) && width.data === null).toBe(true);
  });

  it('persists and reads back the sidebar width', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    await setSidebarWidth(db, 360);
    await setSidebarWidth(db, 412);
    const width = await getSidebarWidth(db);
    expect(isOk(width) && width.data === 412).toBe(true);
  });

  it('remembers the Notes sidebar width separately from the reader sidebar width', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    const before = await getNotesSidebarWidth(db);
    expect(isOk(before) && before.data === null).toBe(true);

    await setSidebarWidth(db, 300);
    await setNotesSidebarWidth(db, 420);

    const reader = await getSidebarWidth(db);
    const notes = await getNotesSidebarWidth(db);
    expect(isOk(reader) && reader.data === 300).toBe(true);
    expect(isOk(notes) && notes.data === 420).toBe(true);
  });

  it('treats a non-numeric stored sidebar width as unset', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());
    await db.run("INSERT INTO settings (key, value) VALUES ('reader.sidebarWidth', 'wide')");

    const width = await getSidebarWidth(db);
    expect(isOk(width) && width.data === null).toBe(true);
  });
});

describe('Target language setting', () => {
  it('is null until a Target language is chosen', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    const language = await getTargetLanguage(db);
    expect(language).toEqual({ ok: true, data: null });
  });

  it('persists and reads back a chosen Target language', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    const saved = await setTargetLanguage(db, 'ja');
    expect(saved.ok).toBe(true);
    expect(await getTargetLanguage(db)).toEqual({ ok: true, data: 'ja' });
  });

  it('overwrites an earlier choice', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    await setTargetLanguage(db, 'ja');
    await setTargetLanguage(db, 'zh-TW');
    expect(await getTargetLanguage(db)).toEqual({ ok: true, data: 'zh-TW' });
  });

  it('rejects an unsupported code and keeps the earlier choice', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());
    await setTargetLanguage(db, 'ja');

    const saved = await setTargetLanguage(db, 'klingon');
    expect(isErr(saved)).toBe(true);
    expect(await getTargetLanguage(db)).toEqual({ ok: true, data: 'ja' });
  });

  it('treats an unsupported stored value as never chosen', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());
    await db.run("INSERT INTO settings (key, value) VALUES ('translation.targetLanguage', 'klingon')");

    expect(await getTargetLanguage(db)).toEqual({ ok: true, data: null });
  });

  it('resolves the effective Target language from the choice, else the system locale', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    expect(await getEffectiveTargetLanguage(db, 'de-AT')).toEqual({ ok: true, data: 'de' });
    await setTargetLanguage(db, 'ja');
    expect(await getEffectiveTargetLanguage(db, 'de-AT')).toEqual({ ok: true, data: 'ja' });
  });

  it('is stored independently of the theme and sidebar widths', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());

    await setTheme(db, 'dark');
    await setSidebarWidth(db, 300);
    await setNotesSidebarWidth(db, 420);
    await setTargetLanguage(db, 'ko');

    expect(await getTargetLanguage(db)).toEqual({ ok: true, data: 'ko' });
    expect(await getTheme(db)).toEqual({ ok: true, data: 'dark' });
    expect(await getSidebarWidth(db)).toEqual({ ok: true, data: 300 });
    expect(await getNotesSidebarWidth(db)).toEqual({ ok: true, data: 420 });
  });
});

describe('focus preferences', () => {
  async function freshDb() {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());
    return db;
  }

  it('falls back to no sound, the default volume and 25 minutes when nothing is stored', async () => {
    const res = await getFocusPreferences(await freshDb());
    expect(res).toEqual({ ok: true, data: { soundId: null, volume: 0.3, minutes: 25 } });
  });

  it('round-trips sound, volume and length', async () => {
    const db = await freshDb();
    expect(isOk(await setFocusPreferences(db, { soundId: 'pink-noise', volume: 0.7, minutes: 45 }))).toBe(true);
    expect(await getFocusPreferences(db)).toEqual({ ok: true, data: { soundId: 'pink-noise', volume: 0.7, minutes: 45 } });
  });

  it('keeps the other choices when saving one, and remembers "no sound"', async () => {
    const db = await freshDb();
    await setFocusPreferences(db, { soundId: 'brown-noise', minutes: 60 });
    await setFocusPreferences(db, { volume: 0 });
    await setFocusPreferences(db, { soundId: null });
    expect(await getFocusPreferences(db)).toEqual({ ok: true, data: { soundId: null, volume: 0, minutes: 60 } });
  });

  it('falls back per value for unknown or out-of-range stored values', async () => {
    const db = await freshDb();
    await setSetting(db, 'focus.soundId', 'whale-song');
    await setSetting(db, 'focus.volume', '4');
    await setSetting(db, 'focus.minutes', '999');
    expect(await getFocusPreferences(db)).toEqual({ ok: true, data: { soundId: null, volume: 0.3, minutes: 25 } });
    await setSetting(db, 'focus.volume', 'loud');
    await setSetting(db, 'focus.minutes', '12.5');
    await setSetting(db, 'focus.soundId', 'white-noise');
    expect(await getFocusPreferences(db)).toEqual({ ok: true, data: { soundId: 'white-noise', volume: 0.3, minutes: 25 } });
  });

  it('rejects invalid values and saves nothing', async () => {
    const db = await freshDb();
    expect(isErr(await setFocusPreferences(db, { soundId: 'whale-song' }))).toBe(true);
    expect(isErr(await setFocusPreferences(db, { volume: 2 }))).toBe(true);
    expect(isErr(await setFocusPreferences(db, { minutes: 0 }))).toBe(true);
    expect(isErr(await setFocusPreferences(db, { minutes: 30, volume: Number.NaN }))).toBe(true);
    expect(await getFocusPreferences(db)).toEqual({ ok: true, data: { soundId: null, volume: 0.3, minutes: 25 } });
  });
});
