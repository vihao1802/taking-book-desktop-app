import type { Result } from '../result';
import { ok } from '../result';
import type { SqlDriver } from '../sql';
import { getSetting, setSetting } from '../settingsRepository';

const QUIZ_PRIVACY_NOTICE_ACK_KEY = 'quiz.privacyNoticeAcknowledged';

/**
 * Reads whether the reader has acknowledged the one-time Quiz privacy notice
 * (ADR-0007) on this device. The acknowledgement is a device-local setting and
 * is never synced, so the notice is shown exactly once, before the first Quiz.
 *
 * @param db - The data-access driver.
 * @returns True once the reader accepted the notice; false before their first Quiz.
 */
export async function getQuizPrivacyNoticeAcknowledged(db: SqlDriver): Promise<Result<boolean>> {
  const stored = await getSetting(db, QUIZ_PRIVACY_NOTICE_ACK_KEY);
  if (!stored.ok) return stored;
  // Only an explicit acknowledgement counts; a missing or malformed value is a
  // device that has not seen the notice yet.
  return ok(stored.data === 'true');
}

/**
 * Remembers on this device that the reader accepted the one-time Quiz privacy
 * notice, so it is never shown again (ADR-0007).
 *
 * @param db - The data-access driver.
 */
export async function acknowledgeQuizPrivacyNotice(db: SqlDriver): Promise<Result<void>> {
  return setSetting(db, QUIZ_PRIVACY_NOTICE_ACK_KEY, 'true');
}