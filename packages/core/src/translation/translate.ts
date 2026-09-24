import type { Result } from '../result';
import { err, ok } from '../result';
import { isSupportedLanguage } from './languages';

/**
 * Longest selection Translate accepts, in characters after whitespace is
 * collapsed. Counted in characters rather than words so the cap means the same
 * for scripts written without spaces.
 */
export const MAX_TRANSLATION_LENGTH = 200;

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
 * @returns The Translation, or a message fit to show the reader: for empty or
 *   too-long text, an unsupported Target language, or an engine failure (whose
 *   detail is left out of the message).
 */
export async function translateText(options: TranslateTextOptions): Promise<Result<Translation>> {
  const { engine, targetLanguage } = options;
  const text = normalizeWhitespace(options.text);
  if (text === '') return err('Select some text to translate.');
  if ([...text].length > MAX_TRANSLATION_LENGTH) {
    return err('Translate is for words and short phrases. Select less text and try again.');
  }
  if (!isSupportedLanguage(targetLanguage)) return err('The Target language is not supported. Choose another in Settings.');

  const result = await engine.translate(text, targetLanguage);
  if (!result.ok) return err(FAILURE_MESSAGES[result.error.kind]);
  return ok({ text: result.data.text, sourceLanguage: result.data.sourceLanguage, targetLanguage });
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
