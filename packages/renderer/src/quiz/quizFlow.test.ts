import { describe, expect, it } from 'vitest';
import {
  currentQuestion,
  initQuizFlow,
  isFinished,
  nextQuestion,
  revealAnswer,
  selectOption,
} from './quizFlow';
import type { QuizQuestion } from '@/reader-api';

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

describe('quizFlow', () => {
  it('starts on the first question, unanswered', () => {
    const questions = [question({ id: 1 }), question({ id: 2 })];
    const state = initQuizFlow(questions);
    expect(currentQuestion(state)).toEqual(questions[0]);
    expect(isFinished(state)).toBe(false);
  });

  it('ignores a reveal with nothing selected', () => {
    const state = initQuizFlow([question({ id: 1 })]);
    const revealed = revealAnswer(state);
    expect(revealed).toEqual(state);
  });

  it('reveals the picked option and records the answer', () => {
    const state = selectOption(initQuizFlow([question({ id: 1 })]), 1);
    const revealed = revealAnswer(state);
    expect(revealed.revealed).toBe(true);
    expect(revealed.answers).toEqual([{ questionId: 1, selectedIndex: 1 }]);
  });

  it('ignores a selection once the answer is revealed', () => {
    const revealed = revealAnswer(selectOption(initQuizFlow([question({ id: 1 })]), 0));
    const changed = selectOption(revealed, 1);
    expect(changed.selected).toBe(0);
  });

  it('does not advance before the current answer is revealed', () => {
    const state = selectOption(initQuizFlow([question({ id: 1 }), question({ id: 2 })]), 0);
    expect(nextQuestion(state)).toEqual(state);
  });

  it('advances to the next question, clearing the selection', () => {
    let state = initQuizFlow([question({ id: 1 }), question({ id: 2 })]);
    state = revealAnswer(selectOption(state, 0));
    state = nextQuestion(state);
    expect(state.index).toBe(1);
    expect(state.selected).toBeNull();
    expect(state.revealed).toBe(false);
    expect(currentQuestion(state)).toEqual(question({ id: 2 }));
  });

  it('is finished once every question has been answered and advanced past', () => {
    let state = initQuizFlow([question({ id: 1 })]);
    state = nextQuestion(revealAnswer(selectOption(state, 0)));
    expect(isFinished(state)).toBe(true);
    expect(currentQuestion(state)).toBeNull();
  });
});
