/**
 * Pure keyboard rules for answering a Quiz question: the digit keys pick an
 * option (numbered from 1), Enter reveals the picked answer, and Enter again
 * moves to the next question. Kept free of the DOM and React so the rules are
 * unit-testable on their own, the same way `readerShortcuts` is in core.
 */

/** What a key press does to the one-question-at-a-time Quiz flow. */
export type QuizKeyAction =
  | { type: 'selectOption'; index: number }
  | { type: 'reveal' }
  | { type: 'next' }
  | null;

/** The subset of the flow the rules need, plus how many options the question has. */
export interface QuizKeyInput {
  /** The pressed key (`event.key`), e.g. `'1'` or `'Enter'`. */
  key: string;
  /** Whether the current answer has already been revealed. */
  revealed: boolean;
  /** The currently picked option index, or null when none is picked yet. */
  selected: number | null;
  /** How many answer options the current question offers (2 for true/false). */
  optionCount: number;
}

/**
 * Decides which Quiz flow action, if any, a key press stands for.
 *
 * @param input - The pressed key and the current question's state.
 * @returns The action to run, or null when the key does nothing here. While
 *   the answer is unrevealed, a digit in range picks that option (1 is the
 *   first) and Enter reveals once something is picked; once revealed, Enter
 *   moves on and digits are ignored.
 */
export function resolveQuizKey({ key, revealed, selected, optionCount }: QuizKeyInput): QuizKeyAction {
  if (revealed) return key === 'Enter' ? { type: 'next' } : null;
  const digit = Number(key);
  if (Number.isInteger(digit) && digit >= 1 && digit <= optionCount) {
    return { type: 'selectOption', index: digit - 1 };
  }
  return key === 'Enter' && selected !== null ? { type: 'reveal' } : null;
}