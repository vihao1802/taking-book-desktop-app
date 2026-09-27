import type { QuizAnswerInput, QuizAttemptAnswer, QuizQuestion } from './models';

/**
 * Scores a set of answers against the questions they were given for. Matches
 * by question id rather than order, and an answer for a question that is not
 * in the list (or that names an option index the question does not have)
 * counts as incorrect rather than throwing, so a stale or tampered answer set
 * still yields a score instead of failing the attempt. Kept to at most one
 * answer per question (the first one seen), so a duplicated or replayed
 * answer for the same question can never be counted twice and inflate the
 * score past the question total.
 *
 * @param questions - The Quiz's stored questions, holding the correct answers.
 * @param answers - The reader's answers, at most one per question.
 * @returns One scored answer per distinct question id in `answers`.
 */
export function scoreAnswers(questions: QuizQuestion[], answers: QuizAnswerInput[]): QuizAttemptAnswer[] {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<number>();
  const scored: QuizAttemptAnswer[] = [];
  for (const answer of answers) {
    if (seen.has(answer.questionId)) continue;
    seen.add(answer.questionId);
    const question = byId.get(answer.questionId);
    const correct = question !== undefined && question.correctIndex === answer.selectedIndex;
    scored.push({ questionId: answer.questionId, selectedIndex: answer.selectedIndex, correct });
  }
  return scored;
}

/** Counts how many scored answers were correct. */
export function totalCorrect(scored: QuizAttemptAnswer[]): number {
  return scored.filter((answer) => answer.correct).length;
}
