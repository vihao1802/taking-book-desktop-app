import { describe, expect, it } from 'vitest';
import { getSidebarWidth, getTheme, setSidebarWidth, setTheme, settingsSchema } from '../src';
import { isOk } from '../src';
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

  it('treats a non-numeric stored sidebar width as unset', async () => {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());
    await db.run("INSERT INTO settings (key, value) VALUES ('reader.sidebarWidth', 'wide')");

    const width = await getSidebarWidth(db);
    expect(isOk(width) && width.data === null).toBe(true);
  });
});
