/** A Quiz question's kind: true/false, or four-option multiple choice. */
export type QuizQuestionType = 'true_false' | 'multiple_choice';

/**
 * One Quiz question as stored: its prompt, its options with exactly one
 * correct one, the explanation and source page revealed after answering.
 */
export interface QuizQuestion {
  id: number;
  quizId: number;
  /** 0-based order in which the question is asked. */
  orderIndex: number;
  type: QuizQuestionType;
  prompt: string;
  /** Two options ('True'/'False') for a true/false question, four for multiple choice. */
  options: string[];
  /** Index into `options` of the single correct answer. */
  correctIndex: number;
  explanation: string;
  /** Real PDF page number this question is drawn from. */
  sourcePage: number;
}

/** A generated Quiz: its scope, size and questions, for one Book. */
export interface Quiz {
  id: number;
  fileHash: string;
  /** First page (inclusive) of the Quiz scope. */
  scopeStartPage: number;
  /** Last page (inclusive) of the Quiz scope; the Last-read position it was generated from. */
  scopeEndPage: number;
  size: number;
  createdAt: string;
  questions: QuizQuestion[];
}

/** The reader's answer to one question of an in-progress or finished attempt. */
export interface QuizAnswerInput {
  questionId: number;
  selectedIndex: number;
}

/** One scored answer within a Quiz attempt. */
export interface QuizAttemptAnswer {
  questionId: number;
  selectedIndex: number;
  correct: boolean;
}

/** One time a reader completed a Quiz, with its score. */
export interface QuizAttempt {
  id: number;
  quizId: number;
  fileHash: string;
  score: number;
  total: number;
  completedAt: string;
  answers: QuizAttemptAnswer[];
}
