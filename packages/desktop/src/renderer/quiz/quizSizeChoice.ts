import { DEFAULT_QUIZ_SIZE, QUIZ_SIZES } from '@taking-book/core';
import type { QuizSize } from '@taking-book/core';

/**
 * The size picker's choices in the Quiz setup screen, kept as a pure,
 * UI-free module so the setup screen's size behavior can be unit-tested
 * without rendering (see quizScopeChoice.ts). Offered sizes and the default
 * come from the core's canonical constants, so the picker cannot drift from
 * what the Quiz service accepts.
 */
export function quizSizeOptions(): readonly QuizSize[] {
  return QUIZ_SIZES;
}

/** The size a new Quiz setup starts on. */
export function defaultSizeChoice(): QuizSize {
  return DEFAULT_QUIZ_SIZE;
}

/** True when `value` is one of the offered Quiz sizes. */
export function isSizeChoice(value: number): value is QuizSize {
  return (QUIZ_SIZES as readonly number[]).includes(value);
}