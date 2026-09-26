import type { Result } from '../result';
import { err, ok } from '../result';
import { isSupportedLanguage } from './languages';

/**
 * Longest selection Translate accepts, in characters after whitespace is
 * collapsed. Counted in characters rather than words so the cap means the same
 * for scripts written without spaces.
 */
export const MAX_TRANSLATION_LENGTH = 200;

/**
 * How long an engine may take before the reader is told the service could not
 * be reached. Engines should cancel their own request at this point too; this
 * is the backstop that keeps the popup from loading forever when one does not.
 */
export const TRANSLATION_TIMEOUT_MS = 10_000;

/** What a {@link TranslationEngine} answers with. */
export interface EngineTranslation {
  text: string;
  /** The language the engine detected the input as, or null when it did not say. */
  sourceLanguage: string | null;
}

/**
 * Why an engine call failed. `kind` picks the reader-facing message; `detail`
 * is for logs only and never reaches the reader.
 */
export interface TranslationEngineFailure {
  kind: TranslationFailureKind;
  detail: string;
}

export type TranslationFailureKind = 'rate-limited' | 'unreachable' | 'other';

/**
 * The network side of translation, injected by each platform (desktop wraps
 * `google-translate-api-x` in the main process) so core never depends on a
 * translation library. Implementations must resolve, never reject.
 */
export interface TranslationEngine {
  translate(text: string, targetLanguage: string): Promise<Result<EngineTranslation, TranslationEngineFailure>>;
}

/** A Translation of the reader's selection, shown in the Translation popup and never stored. */
export interface Translation {
  text: string;
  sourceLanguage: string | null;
  targetLanguage: string;
}

export interface TranslateTextOptions {
  engine: TranslationEngine;
  /** The selected text, untrusted and unnormalized. */
  text: string;
  targetLanguage: string;
  /** Defaults to {@link TRANSLATION_TIMEOUT_MS}. */
  timeoutMs?: number;
  /**
   * Called with every engine failure, including a timeout, so the platform can
   * log its kind and detail; the reader only ever sees the message.
   */
  onEngineFailure?: (failure: TranslationEngineFailure) => void;
}

/** The reader-facing message for a translation that failed for no reason worth telling them. */
export const TRANSLATION_FAILED_MESSAGE = 'Could not translate this text.';

const FAILURE_MESSAGES: Readonly<Record<TranslationFailureKind, string>> = {
  'rate-limited': 'The translation service is busy. Try again shortly.',
  unreachable: 'Could not reach the translation service. Check your connection.',
  other: TRANSLATION_FAILED_MESSAGE,
};

/**
 * Translates a selection into the Target language.
 *
 * @param options.engine The platform's translation engine.
 * @param options.text The selected text; line breaks and whitespace runs are
 *   collapsed to single spaces before anything else is checked.
 * @param options.targetLanguage A code from the supported-languages list.
 * @param options.timeoutMs How long the engine may take; defaults to {@link TRANSLATION_TIMEOUT_MS}.
 * @param options.onEngineFailure Receives every engine failure's kind and detail, for logging.
 * @returns The Translation, or a message fit to show the reader: for empty or
 *   too-long text, an unsupported Target language, or an engine failure (whose
 *   detail is left out of the message). An engine that takes longer than
 *   `timeoutMs` counts as unreachable.
 */
export async function translateText(options: TranslateTextOptions): Promise<Result<Translation>> {
  const { engine, targetLanguage } = options;
  const text = normalizeWhitespace(options.text);
  if (text === '') return err('Select some text to translate.');
  if ([...text].length > MAX_TRANSLATION_LENGTH) {
    return err('Translate is for words and short phrases. Select less text and try again.');
  }
  if (!isSupportedLanguage(targetLanguage)) return err('The Target language is not supported. Choose another in Settings.');

  const result = await callEngineWithTimeout(engine, { text, targetLanguage, timeoutMs: options.timeoutMs ?? TRANSLATION_TIMEOUT_MS });
  if (!result.ok) {
    options.onEngineFailure?.(result.error);
    return err(FAILURE_MESSAGES[result.error.kind]);
  }
  return ok({ text: result.data.text, sourceLanguage: result.data.sourceLanguage, targetLanguage });
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

interface EngineCall {
  text: string;
  targetLanguage: string;
  timeoutMs: number;
}

// Also folds a rejecting engine into an `other` failure, so a broken engine
// still ends the loading state with a reader-facing message.
async function callEngineWithTimeout(
  engine: TranslationEngine,
  { text, targetLanguage, timeoutMs }: EngineCall,
): Promise<Result<EngineTranslation, TranslationEngineFailure>> {
  let timer: unknown;
  const timeout = new Promise<Result<EngineTranslation, TranslationEngineFailure>>((resolve) => {
    timer = setTimeout(
      () => resolve(err({ kind: 'unreachable', detail: `timed out after ${timeoutMs} ms` })),
      timeoutMs,
    );
  });
  const request = engine
    .translate(text, targetLanguage)
    .catch((error: unknown) => err<TranslationEngineFailure>({ kind: 'other', detail: `engine rejected: ${String(error)}` }));
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
