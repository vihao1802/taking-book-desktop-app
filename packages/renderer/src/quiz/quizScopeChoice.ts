import { DEFAULT_QUIZ_SCOPE_PAGES } from '@taking-book/core';

/**
 * The page range shown to the reader before they start a Quiz, and the
 * numbers that flow into `generateQuiz`. Kept separate from the setup
 * screen's JSX so the widening rule (never past `lastPage`, never below page
 * 1) can be unit-tested without rendering anything.
 */
export interface QuizScopeChoice {
  startPage: number;
  endPage: number;
  /** True when `startPage` is the computed default rather than a widened choice. */
  isDefault: boolean;
}

/** The default scope: the most recent `DEFAULT_QUIZ_SCOPE_PAGES` pages, ending at the Last-read position. */
export function defaultScopeChoice(lastPage: number): QuizScopeChoice {
  return { startPage: Math.max(1, lastPage - DEFAULT_QUIZ_SCOPE_PAGES + 1), endPage: lastPage, isDefault: true };
}

/**
 * Widens the scope to start on `requestedStartPage`, clamped to a real page no
 * later than the default start (moving the start page earlier is the only
 * kind of widening the reader can do; see the `Quiz scope` glossary entry).
 */
export function widenScopeChoice(lastPage: number, requestedStartPage: number): QuizScopeChoice {
  const defaultStart = defaultScopeChoice(lastPage).startPage;
  const startPage = Math.min(Math.max(1, Math.round(requestedStartPage)), defaultStart);
  return { startPage, endPage: lastPage, isDefault: startPage === defaultStart };
}
