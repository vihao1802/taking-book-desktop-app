import type { Result } from '../result';
import { err, ok } from '../result';

/** Quiz sizes the reader can choose from; see the `Quiz size` glossary entry. */
export const QUIZ_SIZES = [5, 10, 15] as const;
export type QuizSize = (typeof QUIZ_SIZES)[number];

export const DEFAULT_QUIZ_SIZE: QuizSize = 10;

/**
 * How many pages the default Quiz scope reaches back from the Last-read
 * position, before the reader widens it. Picked to cover a recent reading
 * session's worth of pages without asking the AI provider to summarize an
 * entire book by default.
 */
export const DEFAULT_QUIZ_SCOPE_PAGES = 15;

/** True when `value` is one of the Quiz sizes the reader can choose ({@link QUIZ_SIZES}). */
export function isQuizSize(value: number): value is QuizSize {
  return (QUIZ_SIZES as readonly number[]).includes(value);
}

/** The resolved page range (inclusive) a Quiz is drawn from. */
export interface QuizScope {
  startPage: number;
  endPage: number;
}

/**
 * Resolves the page range a Quiz is drawn from. The scope always ends at the
 * Last-read position (`lastPage`) so a Quiz can never spoil unread pages. With
 * no explicit start it defaults to the most recent `DEFAULT_QUIZ_SCOPE_PAGES`
 * pages; the reader widens the scope by passing an earlier `requestedStartPage`.
 *
 * @param lastPage - Real PDF page of the Last-read position; the scope's end.
 * @param requestedStartPage - The reader's chosen first page, if they widened the scope.
 * @returns The resolved scope, or an error message when there is no read
 *   progress yet or the requested start page is out of range.
 */
export function resolveQuizScope(
  lastPage: number,
  requestedStartPage?: number,
): Result<QuizScope> {
  if (!Number.isInteger(lastPage) || lastPage < 1) {
    return err('This book has no read progress yet, so a Quiz cannot be made.');
  }
  if (requestedStartPage === undefined) {
    return ok({ startPage: Math.max(1, lastPage - DEFAULT_QUIZ_SCOPE_PAGES + 1), endPage: lastPage });
  }
  if (!Number.isInteger(requestedStartPage) || requestedStartPage < 1) {
    return err('The Quiz scope must start on a real page.');
  }
  if (requestedStartPage > lastPage) {
    return err('The Quiz scope cannot start past the Last-read position.');
  }
  return ok({ startPage: requestedStartPage, endPage: lastPage });
}
