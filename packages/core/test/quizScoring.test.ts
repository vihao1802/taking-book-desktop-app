import { describe, expect, it } from 'vitest';
import { scoreAnswers, totalCorrect } from '../src/index';
import type { QuizQuestion } from '../src/index';

function question(overrides: Partial<QuizQuestion>): QuizQuestion {
  return {
    id: 1,
    quizId: 1,
    orderIndex: 0,
    type: 'true_false',
    prompt: 'p',
    options: ['True', 'False'],
    correctIndex: 0,
    explanation: 'e',
    sourcePage: 1,
    ...overrides,
  };
}

describe('scoreAnswers', () => {
  it('marks an answer correct when it matches the stored correctIndex', () => {
    const questions = [question({ id: 1, correctIndex: 0 })];
    const scored = scoreAnswers(questions, [{ questionId: 1, selectedIndex: 0 }]);
    expect(scored).toEqual([{ questionId: 1, selectedIndex: 0, correct: true }]);
  });

  it('marks an answer incorrect when it does not match', () => {
    const questions = [question({ id: 1, correctIndex: 0 })];
    const scored = scoreAnswers(questions, [{ questionId: 1, selectedIndex: 1 }]);
    expect(scored[0].correct).toBe(false);
  });

  it('marks an answer to an unknown question incorrect instead of throwing', () => {
    const questions = [question({ id: 1, correctIndex: 0 })];
    const scored = scoreAnswers(questions, [{ questionId: 999, selectedIndex: 0 }]);
    expect(scored).toEqual([{ questionId: 999, selectedIndex: 0, correct: false }]);
  });

  it('scores every question independently', () => {
    const questions = [
      question({ id: 1, correctIndex: 0 }),
      question({ id: 2, correctIndex: 1 }),
    ];
    const scored = scoreAnswers(questions, [
      { questionId: 1, selectedIndex: 0 },
      { questionId: 2, selectedIndex: 0 },
    ]);
    expect(totalCorrect(scored)).toBe(1);
  });

  it('keeps only the first answer for a question that was answered more than once, so a duplicated answer cannot inflate the score', () => {
    const questions = [question({ id: 1, correctIndex: 0 })];
    const scored = scoreAnswers(questions, [
      { questionId: 1, selectedIndex: 0 },
      { questionId: 1, selectedIndex: 0 },
    ]);
    expect(scored).toHaveLength(1);
    expect(totalCorrect(scored)).toBe(1);
  });
});
