/**
 * The one-time notice shown before a reader's first Quiz (ADR-0007): the text
 * of the pages in scope is sent to the AI provider using their own key.
 * Acknowledgement is remembered device-local, so the notice is shown once and
 * then never again. Declining sends nothing, shows nothing, and leaves the
 * gate pending so the next Quiz start shows the notice again. Kept free of
 * React and IPC so the rules are unit-testable on their own.
 */
export interface QuizPrivacyNoticeGate {
  /** Whether the reader acknowledged the notice on this device. */
  acknowledged: boolean;
  /** Whether the notice is currently shown. */
  shown: boolean;
}

/** The reader's possible moves on the notice: start a Quiz, accept, or decline. */
export type QuizPrivacyAction = 'start-quiz' | 'accept' | 'decline';

/** A fresh gate for this device: pending until acknowledged, never shown yet. */
export function quizPrivacyNoticeGate(acknowledged: boolean): QuizPrivacyNoticeGate {
  return { acknowledged, shown: false };
}

/**
 * Moves the notice gate through the reader's actions. Starting a Quiz shows
 * the notice unless it was already acknowledged on this device; accepting it
 * is remembered and closes it; declining it closes it without acknowledging,
 * so it shows again on the next start.
 */
export function applyQuizPrivacyAction(
  gate: QuizPrivacyNoticeGate,
  action: QuizPrivacyAction,
): QuizPrivacyNoticeGate {
  switch (action) {
    case 'start-quiz':
      return gate.acknowledged ? gate : { ...gate, shown: true };
    case 'accept':
      return { acknowledged: true, shown: false };
    case 'decline':
      return { ...gate, shown: false };
  }
}