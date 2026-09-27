import { describe, expect, it } from 'vitest';
import { acknowledgeQuizPrivacyNotice, getQuizPrivacyNoticeAcknowledged, settingsSchema } from '../src';
import { createMemoryDriver } from './helpers';

describe('Quiz privacy notice acknowledgement', () => {
  async function freshDb() {
    const db = createMemoryDriver();
    await db.exec(settingsSchema());
    return db;
  }

  it('is not acknowledged before a reader’s first Quiz', async () => {
    expect(await getQuizPrivacyNoticeAcknowledged(await freshDb())).toEqual({ ok: true, data: false });
  });

  it('is remembered once acknowledged, so the notice is not shown again', async () => {
    const db = await freshDb();
    const saved = await acknowledgeQuizPrivacyNotice(db);
    expect(saved.ok).toBe(true);
    expect(await getQuizPrivacyNoticeAcknowledged(db)).toEqual({ ok: true, data: true });
  });

  it('treats anything but an explicit acknowledgement as not acknowledged', async () => {
    const db = await freshDb();
    await db.run("INSERT INTO settings (key, value) VALUES ('quiz.privacyNoticeAcknowledged', '1')");
    expect(await getQuizPrivacyNoticeAcknowledged(db)).toEqual({ ok: true, data: false });
  });

  it('stores the acknowledgement independently of other settings', async () => {
    const db = await freshDb();
    await acknowledgeQuizPrivacyNotice(db);
    await db.run("INSERT INTO settings (key, value) VALUES ('theme', 'dark')");
    expect(await getQuizPrivacyNoticeAcknowledged(db)).toEqual({ ok: true, data: true });
  });
});