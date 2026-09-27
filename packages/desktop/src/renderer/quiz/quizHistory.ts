import { missedQuestions } from '@taking-book/core';
import type { Quiz, QuizAttempt, QuizMissedQuestion } from '../../shared/types';

/**
 * The state of the attempt-history screen and the review of one attempt's
 * missed questions. Kept free of IPC and React, like quizFlow.ts, so the
 * list-and-review rules (list newest-first, review derives its questions from
 * the attempt's Quiz) are unit-testable without rendering. The list stays as
 * core ordered it: `listQuizAttemptsForBook` already returns newest first.
 */
export type QuizHistoryStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface QuizHistoryState {
  status: QuizHistoryStatus;
  /** A Book's attempts, newest first. */
  attempts: QuizAttempt[];
  error: string | null;
  /** The review of one attempt's missed questions, when one is open. */
  review: QuizReviewState | null;
}

export interface QuizReviewState {
  attempt: QuizAttempt;
  status: QuizHistoryStatus;
  missed: QuizMissedQuestion[];
  error: string | null;
}

/** The empty history: nothing loaded yet, no review open. */
export function initialHistory(): QuizHistoryState {
  return { status: 'idle', attempts: [], error: null, review: null };
}

/** The attempt list is being fetched. */
export function historyLoading(state: QuizHistoryState): QuizHistoryState {
  return { ...state, status: 'loading', error: null };
}

/** The list came back; attempts are kept in core's newest-first order. */
export function historyReady(state: QuizHistoryState, attempts: QuizAttempt[]): QuizHistoryState {
  return { ...state, status: 'ready', attempts, error: null };
}

/** The list could not be loaded; the error is fit to show the reader. */
export function historyFailed(state: QuizHistoryState, error: string): QuizHistoryState {
  return { ...state, status: 'error', attempts: [], error };
}

/** Opens the review of one attempt; its Quiz is still being fetched. */
export function beginReview(state: QuizHistoryState, attempt: QuizAttempt): QuizHistoryState {
  return { ...state, review: { attempt, status: 'loading', missed: [], error: null } };
}

/**
 * The attempt's Quiz arrived; the missed questions are derived from it. A Quiz
 * whose Book hash does not match the attempt's is refused — a stale or
 * tampered `quizId` must never surface another Book's questions on a review
 * (attempts stay tied to their Book by content hash).
 */
export function reviewReady(state: QuizHistoryState, quiz: Quiz): QuizHistoryState {
  const review = state.review;
  if (!review) return state;
  if (quiz.fileHash !== review.attempt.fileHash) {
    return {
      ...state,
      review: { ...review, status: 'error', missed: [], error: 'This attempt belongs to another book and cannot be reviewed.' },
    };
  }
  return {
    ...state,
    review: { ...review, status: 'ready', missed: missedQuestions(quiz, review.attempt), error: null },
  };
}

/** The attempt's Quiz could not be loaded; the error is fit to show the reader. */
export function reviewFailed(state: QuizHistoryState, error: string): QuizHistoryState {
  const review = state.review;
  if (!review) return state;
  return { ...state, review: { ...review, status: 'error', missed: [], error } };
}

/** Closes the review and returns to the attempt list. */
export function closeReview(state: QuizHistoryState): QuizHistoryState {
  return { ...state, review: null };
}

/** A stable React key for one attempt, from the Book's content hash and its local id. */
export function attemptKey(attempt: QuizAttempt): string {
  return `${attempt.fileHash}:${attempt.id}`;
}

/** Formats an attempt's stored UTC timestamp (`YYYY-MM-DD HH:MM:SS`) for display. */
export function formatAttemptTime(completedAt: string): string {
  return new Date(completedAt.replace(' ', 'T') + 'Z').toLocaleString();
}