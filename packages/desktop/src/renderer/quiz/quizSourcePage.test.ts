import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '../../shared/types';
import { sourcePageJump } from './quizSourcePage';

function question(sourcePage: number, overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: 1,
    quizId: 1,
    orderIndex: 0,
    type: 'multiple_choice',
    prompt: 'p',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'e',
    sourcePage,
    ...overrides,
  };
}

describe('sourcePageJump', () => {
  it('carries the question’s real PDF page to open the Book at', () => {
    expect(sourcePageJump(7).page).toBe(7);
    expect(sourcePageJump(1).page).toBe(1);
  });

  it('names the control after that page so it is announced and read correctly', () => {
    expect(sourcePageJump(7).label).toBe('Go to page 7');
    expect(sourcePageJump(12).label).toBe('Go to page 12');
  });

  it('opens the Book at the page the question is drawn from, not any other', () => {
    const onPage = question(4);
    const jump = sourcePageJump(onPage.sourcePage);
    expect(jump.page).toBe(onPage.sourcePage);
    expect(jump.page).not.toBe(1);
  });
});