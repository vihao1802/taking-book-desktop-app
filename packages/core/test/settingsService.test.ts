import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSettingsService,
  formatLocalDay,
  getDailyReadingMinutes,
  isErr,
  isOk,
  startDatabase,
  upsertFile,
  type Result,
  type SettingsService,
  type SqlDriver,
} from '../src';
import { createMemoryDriver } from './helpers';

function unwrap<T>(result: Result<T>): T {
  if (!isOk(result)) throw new Error(result.error);
  return result.data;
}

describe('createSettingsService', () => {
  let db: SqlDriver;
  let service: SettingsService;
  let fileId: number;
  let locale: string;
  let clock: Date;

  beforeEach(async () => {
    db = createMemoryDriver();
    await startDatabase(db);
    fileId = unwrap(await upsertFile(db, { hash: 'h1', title: 'One', filePath: '/1.pdf' })).id;
    locale = 'en-US';
    clock = new Date(2026, 7, 15, 10, 0, 0);
    service = createSettingsService(db, { getSystemLocale: () => locale, now: () => clock });
  });

  it('defaults the theme to system and persists a change', async () => {
    expect(unwrap(await service.getTheme())).toBe('system');
    unwrap(await service.setTheme('sepia'));
    expect(unwrap(await service.getTheme())).toBe('sepia');
  });

  it('keeps the reader and Notes sidebar widths apart', async () => {
    expect(unwrap(await service.getSidebarWidth())).toBeNull();
    unwrap(await service.setSidebarWidth(320));
    unwrap(await service.setNotesSidebarWidth(410));
    expect(unwrap(await service.getSidebarWidth())).toBe(320);
    expect(unwrap(await service.getNotesSidebarWidth())).toBe(410);
  });

  it('defaults the Target language from the system language', async () => {
    locale = 'fr-FR';
    expect(unwrap(await service.getTargetLanguage())).toBe('fr');
  });

  it('returns the chosen Target language over the system language', async () => {
    unwrap(await service.setTargetLanguage('de'));
    expect(unwrap(await service.getTargetLanguage())).toBe('de');
  });

  it('rejects an unsupported Target language and keeps the default', async () => {
    expect(isErr(await service.setTargetLanguage('xx-nope'))).toBe(true);
    expect(unwrap(await service.getTargetLanguage())).toBe('en');
  });

  it('records reading minutes against today and accumulates them', async () => {
    unwrap(await service.recordReadingSession(fileId, 2));
    unwrap(await service.recordReadingSession(fileId, 3));
    const daily = unwrap(await getDailyReadingMinutes(db, 7, formatLocalDay(clock)));
    expect(daily).toEqual([{ day: '2026-08-15', minutes: 5 }]);
  });
});
