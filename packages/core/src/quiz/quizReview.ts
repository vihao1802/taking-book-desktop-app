import type { Quiz, QuizAttempt } from './models';

/** One question the reader got wrong in a finished attempt, ready to review. */
export interface QuizMissedQuestion {
  questionId: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** Real PDF page this question came from, so the reader can go back and reread it. */
  sourcePage: number;
  /** The option the reader picked, which was wrong. */
  selectedIndex: number;
}

/**
 * The questions the reader got wrong in one finished attempt, in the order the
 * Quiz asked them, each with the correct answer, explanation and source page
 * plus the option the reader picked. Missed questions are matched to the
 * Quiz's stored questions by id, and a question counts as missed when the
 * reader's chosen option differs from the stored correct one — so the review
 * stays self-consistent even if an answer's `correct` flag ever went stale. An
 * answer for a question the Quiz no longer has is dropped, and only questions
 * the reader actually got wrong are included.
 *
 * @param quiz - The Quiz the attempt was taken on, with its stored questions.
 * @param attempt - The finished attempt, holding the reader's scored answers.
 * @returns One entry per missed question, in the Quiz's question order.
 */
export function missedQuestions(quiz: Quiz, attempt: QuizAttempt): QuizMissedQuestion[] {
  const answersByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const missed: QuizMissedQuestion[] = [];
  for (const question of quiz.questions) {
    const answer = answersByQuestion.get(question.id);
    if (answer && answer.selectedIndex !== question.correctIndex) {
      missed.push({
        questionId: question.id,
        prompt: question.prompt,
        options: question.options,
        correctIndex: question.correctIndex,
        explanation: question.explanation,
        sourcePage: question.sourcePage,
        selectedIndex: answer.selectedIndex,
      });
    }
  }
  return missed;
}