import type { QuizAnswerInput, QuizQuestion } from '../../shared/types';

/**
 * Pure state for taking a Quiz one question at a time: the current question,
 * whether its answer has been revealed, and the answers accumulated so far.
 * Kept free of IPC and React so the flow's rules (can't reveal twice, can't
 * advance before revealing, scoring order) are unit-testable on their own.
 */
export interface QuizFlowState {
  questions: QuizQuestion[];
  index: number;
  selected: number | null;
  revealed: boolean;
  answers: QuizAnswerInput[];
}

export function initQuizFlow(questions: QuizQuestion[]): QuizFlowState {
  return { questions, index: 0, selected: null, revealed: false, answers: [] };
}

/** The question currently being asked, or null once every question has been answered. */
export function currentQuestion(state: QuizFlowState): QuizQuestion | null {
  return state.questions[state.index] ?? null;
}

export function isFinished(state: QuizFlowState): boolean {
  return state.index >= state.questions.length;
}

/** Picks an option for the current question; ignored once the answer is revealed. */
export function selectOption(state: QuizFlowState, optionIndex: number): QuizFlowState {
  if (state.revealed) return state;
  return { ...state, selected: optionIndex };
}

/**
 * Locks in the current answer and reveals it. Requires an option to have been
 * selected; a caller with no reveal-eligible selection gets the state back
 * unchanged rather than recording an answer that was never chosen.
 */
export function revealAnswer(state: QuizFlowState): QuizFlowState {
  if (state.revealed || state.selected === null) return state;
  const question = currentQuestion(state);
  if (!question) return state;
  return {
    ...state,
    revealed: true,
    answers: [...state.answers, { questionId: question.id, selectedIndex: state.selected }],
  };
}

/** Advances to the next question; only takes effect once the current one is revealed. */
export function nextQuestion(state: QuizFlowState): QuizFlowState {
  if (!state.revealed) return state;
  return { ...state, index: state.index + 1, selected: null, revealed: false };
}
