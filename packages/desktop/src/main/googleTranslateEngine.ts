import { translate } from 'google-translate-api-x';
import { TRANSLATION_TIMEOUT_MS } from '@taking-book/core';
import type { EngineTranslation, Result, TranslationEngine, TranslationEngineFailure, TranslationFailureKind } from '@taking-book/core';

// Codes undici puts on a fetch failure's cause when the network, not the
// service, is the problem.
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * The desktop {@link TranslationEngine}: `google-translate-api-x` over the
 * unofficial Google Translate web endpoint (ADR-0004). Runs in the main
 * process because that endpoint sends no CORS headers. Failures come back as
 * a coarse kind plus a detail for the caller to log; this never rejects.
 */
export const googleTranslateEngine: TranslationEngine = {
  async translate(text, targetLanguage): Promise<Result<EngineTranslation, TranslationEngineFailure>> {
    try {
      const response = await translate(text, {
        to: targetLanguage,
        requestOptions: { signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS) },
      });
      return { ok: true, data: { text: response.text, sourceLanguage: detectedLanguage(response.from) } };
    } catch (error) {
      return { ok: false, error: { kind: classifyFailure(error), detail: describeError(error) } };
    }
  },
};

// The batch endpoint reports the language as `from.language.iso`; the single
// endpoint, which the library falls back to, replaces `from` with the code.
function detectedLanguage(from: unknown): string | null {
  const code = typeof from === 'string' ? from : readIso(from);
  return code && code !== 'auto' ? code : null;
}

function readIso(from: unknown): string | null {
  if (typeof from !== 'object' || from === null || !('language' in from)) return null;
  const language = from.language;
  if (typeof language !== 'object' || language === null || !('iso' in language)) return null;
  return typeof language.iso === 'string' ? language.iso : null;
}

function classifyFailure(error: unknown): TranslationFailureKind {
  if (!(error instanceof Error)) return 'other';
  if (error.name === 'TooManyRequestsError' || responseStatus(error) === 429) return 'rate-limited';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'unreachable';
  if (isNetworkFailure(error)) return 'unreachable';
  return 'other';
}

// The library throws an Error whose cause carries the fetch Response on a non-OK status.
function responseStatus(error: Error): number | null {
  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null || !('response' in cause)) return null;
  const response = cause.response;
  if (typeof response !== 'object' || response === null || !('status' in response)) return null;
  return typeof response.status === 'number' ? response.status : null;
}

// fetch rejects with `TypeError: fetch failed` and the socket error as its cause.
function isNetworkFailure(error: Error): boolean {
  if (!(error instanceof TypeError)) return false;
  if (error.message === 'fetch failed') return true;
  const code = causeCode(error);
  return code !== null && NETWORK_ERROR_CODES.has(code);
}

// The socket error code (ENOTFOUND, say) that undici puts on a fetch failure's cause.
function causeCode(error: Error): string | null {
  const cause = error.cause;
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return null;
  return typeof cause.code === 'string' ? cause.code : null;
}

// The socket error code on the cause (ENOTFOUND, say) is what tells an
// offline machine apart from a blocked host, so it is kept in the log line.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const status = responseStatus(error);
  const extra = [causeCode(error), status === null ? null : `HTTP ${status}`].filter(Boolean);
  return `${error.name}: ${error.message}${extra.length > 0 ? ` (${extra.join(', ')})` : ''}`;
}
