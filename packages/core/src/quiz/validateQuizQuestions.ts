import type { Result } from '../result';
import { err, ok } from '../result';
import type { QuizQuestionType } from './models';
import type { QuizProviderFailure, QuizProviderQuestion, QuizProviderRequest } from './quizProvider';

/**
 * Validates a provider's raw response against the request that produced it:
 * the right number of questions, each a well-formed true/false or
 * multiple-choice question with exactly one correct answer and a source page
 * that is actually in the requested scope. Shared by every provider adapter so
 * "malformed", "partial" and "wrong count" responses are all rejected the same
 * way before a Quiz is stored.
 *
 * @param parsed - The provider's response, already decoded from its transport
 *   envelope (e.g. Gemini's JSON text part) but not yet checked.
 * @param request - The request the response answers, used to check the count
 *   and that every source page is one that was actually sent.
 * @returns The validated questions, or a `malformed` failure describing what was wrong.
 */
export function validateQuizQuestions(
  parsed: unknown,
  request: QuizProviderRequest,
): Result<QuizProviderQuestion[], QuizProviderFailure> {
  if (!Array.isArray(parsed)) {
    return err({ kind: 'malformed', detail: 'response was not an array of questions' });
  }
  if (parsed.length !== request.size) {
    return err({
      kind: 'malformed',
      detail: `expected ${request.size} questions, got ${parsed.length}`,
    });
  }
  const validPages = new Set(request.pages.map((p) => p.page));
  const questions: QuizProviderQuestion[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const question = validateOne(parsed[i], validPages);
    if (!question.ok) return err({ kind: 'malformed', detail: `question ${i}: ${question.error}` });
    questions.push(question.data);
  }
  return ok(questions);
}

function validateOne(raw: unknown, validPages: Set<number>): Result<QuizProviderQuestion, string> {
  if (typeof raw !== 'object' || raw === null) return err('not an object');
  const value = raw as Record<string, unknown>;

  if (!isQuestionType(value.type)) return err(`unknown question type ${String(value.type)}`);
  if (typeof value.prompt !== 'string' || value.prompt.trim() === '') return err('missing prompt');
  if (typeof value.explanation !== 'string' || value.explanation.trim() === '') return err('missing explanation');
  if (!Array.isArray(value.options) || !value.options.every((o) => typeof o === 'string')) {
    return err('options must be a string array');
  }
  const expectedOptionCount = value.type === 'true_false' ? 2 : 4;
  if (value.options.length !== expectedOptionCount) {
    return err(`expected ${expectedOptionCount} options for a ${value.type} question, got ${value.options.length}`);
  }
  if (
    typeof value.correctIndex !== 'number' ||
    !Number.isInteger(value.correctIndex) ||
    value.correctIndex < 0 ||
    value.correctIndex >= value.options.length
  ) {
    return err('correctIndex is out of range');
  }
  if (typeof value.sourcePage !== 'number' || !Number.isInteger(value.sourcePage) || !validPages.has(value.sourcePage)) {
    return err('sourcePage is not one of the requested pages');
  }

  return ok({
    type: value.type,
    prompt: value.prompt,
    options: value.options as string[],
    correctIndex: value.correctIndex,
    explanation: value.explanation,
    sourcePage: value.sourcePage,
  });
}

function isQuestionType(value: unknown): value is QuizQuestionType {
  return value === 'true_false' || value === 'multiple_choice';
}
