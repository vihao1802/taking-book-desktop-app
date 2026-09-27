import type { Result } from '../result';
import { err, ok } from '../result';
import type { QuizQuestionType } from './models';

/** AI providers a Quiz can be generated with; only 'gemini' ships (ADR-0007). */
export type AiProviderKind = 'gemini';

/** One page's extracted text fed to the AI provider, never past the Quiz scope. */
export interface QuizScopePage {
  /** Real PDF page number. */
  page: number;
  text: string;
}

/** What the AI provider is asked to write questions from. */
export interface QuizProviderRequest {
  /** The Book's title, given as context; never sent instead of the page text. */
  title: string;
  /** Pages within the Quiz scope, in page order, with non-empty text only. */
  pages: QuizScopePage[];
  /** How many questions to write. */
  size: number;
}

/** One question as the AI provider returns it, before it is stored. */
export interface QuizProviderQuestion {
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourcePage: number;
}

/**
 * Why a provider call failed. `kind` picks the reader-facing message (see
 * `quizService`); `detail` is for logs only and never reaches the reader.
 */
export type QuizProviderFailureKind = 'missing-key' | 'rate-limited' | 'unreachable' | 'malformed' | 'other';

export interface QuizProviderFailure {
  kind: QuizProviderFailureKind;
  detail: string;
}

/**
 * The strategy every AI provider implements (ADR-0007). Implementations must
 * resolve, never reject, and validate the shape of what they return so a
 * malformed, partial or wrong-count response is rejected before it reaches
 * `quizService`.
 */
export interface QuizProviderEngine {
  generateQuestions(
    request: QuizProviderRequest,
    apiKey: string,
  ): Promise<Result<QuizProviderQuestion[], QuizProviderFailure>>;
}

/**
 * Picks the AI provider engine for `kind` out of the engines a platform has
 * registered. Only one provider ships today, but callers already ask for it
 * by kind so a second provider can be added without changing call sites.
 *
 * @param kind - Which AI provider to use.
 * @param engines - The engines a platform has wired up, keyed by kind.
 * @returns The matching engine, or an error message when none is registered for `kind`.
 */
export function createQuizProviderEngine(
  kind: AiProviderKind,
  engines: Partial<Record<AiProviderKind, QuizProviderEngine>>,
): Result<QuizProviderEngine> {
  const engine = engines[kind];
  if (!engine) return err(`No AI provider is registered for "${kind}".`);
  return ok(engine);
}
