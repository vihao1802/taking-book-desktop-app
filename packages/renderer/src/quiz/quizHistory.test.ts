import { describe, expect, it } from 'vitest';
import {
  attemptKey,
  beginReview,
  closeReview,
  historyFailed,
  historyLoading,
  historyReady,
  initialHistory,
  reviewFailed,
  reviewReady,
} from './quizHistory';
import type { Quiz, QuizAttempt } from '@/reader-api';

function question(id: number) {
  return {
    id,
    quizId: 10,
    orderIndex: id - 1,
    type: 'multiple_choice' as const,
    prompt: `Q${id}`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 1,
    explanation: `E${id}`,
    sourcePage: 3,
  };
}

const quiz: Quiz = {
  id: 10,
  fileHash: 'hash-1',
  scopeStartPage: 1,
  scopeEndPage: 5,
  size: 2,
  createdAt: '2026-09-27 10:00:00',
  questions: [question(1), question(2)],
};

function attempt(id: number, answers: QuizAttempt['answers']): QuizAttempt {
  return {
    id,
    quizId: 10,
    fileHash: 'hash-1',
    score: 1,
    total: 2,
    completedAt: '2026-09-27 11:00:00',
    answers,
  };
}

const newest = attempt(2, []);
const older = attempt(1, []);

describe('quizHistory', () => {
  it('starts empty with no review open', () => {
    expect(initialHistory()).toEqual({ status: 'idle', attempts: [], error: null, review: null });
  });

  it('moves the list into loading, then ready with the attempts in the order core returned them', () => {
    let state = initialHistory();
    state = historyLoading(state);
    expect(state.status).toBe('loading');

    state = historyReady(state, [newest, older]);
    expect(state.status).toBe('ready');
    // Newest first is core's guarantee; the module keeps the order it was given.
    expect(state.attempts.map((a) => a.id)).toEqual([2, 1]);
    expect(state.error).toBeNull();
  });

  it('a failed list clears the attempts and surfaces the error', () => {
    let state = historyReady(initialHistory(), [newest]);
    state = historyFailed(state, 'Could not load attempts.');
    expect(state.status).toBe('error');
    expect(state.attempts).toEqual([]);
    expect(state.error).toBe('Could not load attempts.');
  });

  it('beginning a review opens it in loading for the chosen attempt', () => {
    let state = historyReady(initialHistory(), [newest, older]);
    state = beginReview(state, older);
    expect(state.review).toEqual({ attempt: older, status: 'loading', missed: [], error: null });
  });

  it('a loaded Quiz yields the attempt’s missed questions for the review', () => {
    const wrongAttempt = attempt(1, [
      { questionId: 1, selectedIndex: 0, correct: false },
      { questionId: 2, selectedIndex: 1, correct: true },
    ]);
    let state = beginReview(historyReady(initialHistory(), [wrongAttempt]), wrongAttempt);
    state = reviewReady(state, quiz);
    expect(state.review?.status).toBe('ready');
    expect(state.review?.missed.map((m) => m.questionId)).toEqual([1]);
    expect(state.review?.missed[0]).toMatchObject({ prompt: 'Q1', selectedIndex: 0, sourcePage: 3 });
  });

  it('a failed review keeps the attempt but shows the error instead of missed questions', () => {
    const wrongAttempt = attempt(1, [{ questionId: 1, selectedIndex: 0, correct: false }]);
    let state = beginReview(historyReady(initialHistory(), [wrongAttempt]), wrongAttempt);
    state = reviewFailed(state, 'Could not load the questions.');
    expect(state.review?.status).toBe('error');
    expect(state.review?.missed).toEqual([]);
    expect(state.review?.error).toBe('Could not load the questions.');
  });

  it('refuses a Quiz whose Book hash differs from the attempt’s, so another Book’s questions never surface', () => {
    const wrongAttempt = attempt(1, [{ questionId: 1, selectedIndex: 0, correct: false }]);
    let state = beginReview(historyReady(initialHistory(), [wrongAttempt]), wrongAttempt);
    state = reviewReady(state, { ...quiz, fileHash: 'hash-OTHER-BOOK' });
    expect(state.review?.status).toBe('error');
    expect(state.review?.missed).toEqual([]);
    expect(state.review?.error).toMatch(/another book/);
  });

  it('closing the review returns to the attempt list', () => {
    let state = beginReview(historyReady(initialHistory(), [newest]), newest);
    state = closeReview(state);
    expect(state.review).toBeNull();
    expect(state.status).toBe('ready');
    expect(state.attempts).toEqual([newest]);
  });

  it('gives each attempt a stable key from the Book hash and attempt id', () => {
    expect(attemptKey(newest)).toBe('hash-1:2');
  });
});