import type { Result } from '../result';
import { err, isErr } from '../result';
import type { SqlDriver } from '../sql';
import type { Quiz, QuizAnswerInput, QuizAttempt } from './models';
import { createQuiz, saveQuizAttempt } from './quizRepository';
import type { QuizProviderEngine, QuizProviderFailure, QuizScopePage } from './quizProvider';
import { DEFAULT_QUIZ_SIZE, isQuizSize, resolveQuizScope } from './quizScope';

/** Shown when there is no saved AI provider key (ADR-0007); Settings is where one is added. */
export const MISSING_KEY_MESSAGE = 'Add your AI provider key in Settings to take a Quiz.';

/** Shown when the Quiz scope has no extractable text (e.g. a scanned page). */
export const NO_TEXT_MESSAGE = 'This part of the book has no extractable text, so a Quiz cannot be made from it.';

const FAILURE_MESSAGES: Readonly<Record<QuizProviderFailure['kind'], string>> = {
  'missing-key': MISSING_KEY_MESSAGE,
  'rate-limited': 'The AI provider is busy. Try again shortly.',
  unreachable: 'Could not reach the AI provider. Check your connection.',
  malformed: 'The AI provider did not return a usable Quiz. Try again.',
  other: 'Could not generate a Quiz right now. Try again later.',
};

/** Options for {@link generateQuiz}. */
export interface GenerateQuizOptions {
  fileHash: string;
  /** The Book's title, given to the provider as context. */
  title: string;
  /** Real PDF page of the Last-read position; the scope never extends past it. */
  lastPage: number;
  /** The reader's chosen first page, if they widened the default scope. */
  scopeStartPage?: number;
  /** Defaults to {@link DEFAULT_QUIZ_SIZE}. */
  size?: number;
  /** Extracted text for every candidate page; pages outside the resolved scope are ignored. */
  pages: QuizScopePage[];
  engine: QuizProviderEngine;
  /** The reader's saved AI provider key; null when none is saved. */
  apiKey: string | null;
}

/**
 * Generates and stores a Quiz for a Book. A missing key, an out-of-range
 * scope, no extractable text in the scope, or any provider failure each
 * return a clear message and store nothing — existing Quizzes and attempts on
 * this Book are left untouched either way, per the acceptance criteria.
 *
 * @param db - The data-access driver.
 * @param options - The Book, its Last-read position, the requested scope and
 *   size, the extracted page text, the provider engine and the reader's key.
 * @returns The stored Quiz, or an error message fit to show the reader.
 */
export async function generateQuiz(db: SqlDriver, options: GenerateQuizOptions): Promise<Result<Quiz>> {
  if (!options.apiKey || options.apiKey.trim() === '') return err(MISSING_KEY_MESSAGE);

  const scope = resolveQuizScope(options.lastPage, options.scopeStartPage);
  if (isErr(scope)) return scope;

  const size = options.size ?? DEFAULT_QUIZ_SIZE;
  if (!isQuizSize(size)) return err('Quiz size must be 5, 10 or 15.');

  const scopedPages = options.pages
    .filter((page) => page.page >= scope.data.startPage && page.page <= scope.data.endPage)
    .filter((page) => page.text.trim() !== '')
    .sort((a, b) => a.page - b.page);
  if (scopedPages.length === 0) return err(NO_TEXT_MESSAGE);

  const result = await options.engine.generateQuestions(
    { title: options.title, pages: scopedPages, size },
    options.apiKey,
  );
  if (isErr(result)) return err(FAILURE_MESSAGES[result.error.kind]);

  return createQuiz(db, options.fileHash, scope.data, result.data);
}

/** Options for {@link submitQuizAttempt}. */
export interface SubmitQuizAttemptOptions {
  quizId: number;
  fileHash: string;
  answers: QuizAnswerInput[];
}

/**
 * Scores and stores one Quiz attempt. A thin wrapper over
 * `quizRepository.saveQuizAttempt` kept in the service layer so callers
 * (IPC handlers, tests) have one place to submit an attempt from, alongside
 * `generateQuiz`.
 */
export async function submitQuizAttempt(db: SqlDriver, options: SubmitQuizAttemptOptions): Promise<Result<QuizAttempt>> {
  return saveQuizAttempt(db, options.quizId, options.fileHash, options.answers);
}
