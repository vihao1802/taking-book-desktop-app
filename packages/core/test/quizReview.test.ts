import { describe, expect, it } from 'vitest';
import { missedQuestions } from '../src/index';
import type { Quiz, QuizAttempt, QuizQuestion } from '../src/index';

function question(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    id: 1,
    quizId: 10,
    orderIndex: 0,
    type: 'multiple_choice',
    prompt: 'Which is the capital of France?',
    options: ['Berlin', 'Paris', 'Madrid', 'Rome'],
    correctIndex: 1,
    explanation: 'Paris is the capital.',
    sourcePage: 4,
    ...overrides,
  };
}

const quiz: Quiz = {
  id: 10,
  fileHash: 'hash-1',
  scopeStartPage: 1,
  scopeEndPage: 5,
  size: 2,
  createdAt: '2026-09-27 10:00:00',
  questions: [
    question({ id: 1, orderIndex: 0 }),
    question({ id: 2, orderIndex: 1, prompt: 'True or false: the sky is blue.', options: ['True', 'False'], correctIndex: 0 }),
  ],
};

function attempt(answers: QuizAttempt['answers']): QuizAttempt {
  return { id: 1, quizId: 10, fileHash: 'hash-1', score: 0, total: 2, completedAt: '2026-09-27 11:00:00', answers };
}

describe('missedQuestions', () => {
  it('returns each missed question with the correct answer, explanation, source page and the reader’s wrong pick', () => {
    const review = missedQuestions(quiz, attempt([
      { questionId: 1, selectedIndex: 0, correct: false }, // picked Berlin, correct was Paris
    ]));
    expect(review).toEqual([
      {
        questionId: 1,
        prompt: 'Which is the capital of France?',
        options: ['Berlin', 'Paris', 'Madrid', 'Rome'],
        correctIndex: 1,
        explanation: 'Paris is the capital.',
        sourcePage: 4,
        selectedIndex: 0,
      },
    ]);
  });

  it('returns nothing for a perfect attempt', () => {
    const review = missedQuestions(quiz, attempt([
      { questionId: 1, selectedIndex: 1, correct: true },
      { questionId: 2, selectedIndex: 0, correct: true },
    ]));
    expect(review).toEqual([]);
  });

  it('returns every question the reader got wrong, in question order', () => {
    const review = missedQuestions(quiz, attempt([
      { questionId: 2, selectedIndex: 1, correct: false },
      { questionId: 1, selectedIndex: 0, correct: false },
    ]));
    expect(review.map((m) => m.questionId)).toEqual([1, 2]);
  });

  it('drops an answer for a question the Quiz no longer has, and ignores unanswered questions', () => {
    const review = missedQuestions(quiz, attempt([
      { questionId: 99, selectedIndex: 0, correct: false },
      { questionId: 1, selectedIndex: 0, correct: false },
      // question 2 has no answer at all: not reported, since it was never answered.
    ]));
    expect(review.map((m) => m.questionId)).toEqual([1]);
  });

  it('judges a question missed from the chosen option vs the correct one, not the stored flag', () => {
    // The `correct` flags are deliberately stale/wrong: the review recomputes
    // each answer against the stored question, so the flags cannot lie to it.
    const review = missedQuestions(quiz, attempt([
      { questionId: 1, selectedIndex: 0, correct: true }, // flag lies: 0 ≠ correctIndex 1
      { questionId: 2, selectedIndex: 0, correct: false }, // flag lies: 0 === correctIndex 0
    ]));
    expect(review.map((m) => m.questionId)).toEqual([1]);
  });
});