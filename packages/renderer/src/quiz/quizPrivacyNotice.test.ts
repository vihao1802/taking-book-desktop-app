import { describe, expect, it } from 'vitest';
import { applyQuizPrivacyAction, quizPrivacyNoticeGate } from './quizPrivacyNotice';

describe('quiz privacy notice', () => {
  it('starts pending, never shown, so the first Quiz can gate on it', () => {
    expect(quizPrivacyNoticeGate(false)).toEqual({ acknowledged: false, shown: false });
  });

  it('shows the notice on a Quiz start when it has not been acknowledged', () => {
    const gate = applyQuizPrivacyAction(quizPrivacyNoticeGate(false), 'start-quiz');
    expect(gate.shown).toBe(true);
  });

  it('does not show the notice once it has been acknowledged on this device', () => {
    const gate = applyQuizPrivacyAction(quizPrivacyNoticeGate(true), 'start-quiz');
    expect(gate).toEqual({ acknowledged: true, shown: false });
  });

  it('accepting remembers the acknowledgement and closes the notice for good', () => {
    const gate = applyQuizPrivacyAction(quizPrivacyNoticeGate(false), 'start-quiz');
    const accepted = applyQuizPrivacyAction(gate, 'accept');
    expect(accepted).toEqual({ acknowledged: true, shown: false });
    expect(applyQuizPrivacyAction(accepted, 'start-quiz').shown).toBe(false);
  });

  it('declining sends nothing: the notice closes but stays unacknowledged, so the next start shows it again', () => {
    const gate = applyQuizPrivacyAction(quizPrivacyNoticeGate(false), 'start-quiz');
    const declined = applyQuizPrivacyAction(gate, 'decline');
    expect(declined).toEqual({ acknowledged: false, shown: false });
    expect(applyQuizPrivacyAction(declined, 'start-quiz').shown).toBe(true);
  });
});