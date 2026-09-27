import { err } from '../result';
import type { QuizProviderEngine, QuizProviderFailure, QuizProviderRequest } from './quizProvider';
import { validateQuizQuestions } from './validateQuizQuestions';

/** Gemini model used to write Quiz questions; a plain flash model is fast and cheap enough for this. */
export const GEMINI_MODEL = 'gemini-2.0-flash';

/** How long a request may take before it counts as unreachable; writing a Quiz reads more text than a translation, so this is more generous than `TRANSLATION_TIMEOUT_MS`. */
export const GEMINI_TIMEOUT_MS = 45_000;

function endpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * The subset of the global `fetch` signature the adapter needs, so tests can
 * inject a fake without touching the network. Real callers pass the platform's
 * `fetch`, which is a global in both the Electron main process and the browser
 * — no Electron or react-native import is needed here.
 */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: GlobalAbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** The subset of the global `AbortSignal` instance shape this adapter passes through to `fetch`. */
type GlobalAbortSignal = { aborted: boolean };
interface GlobalAbortSignalCtor {
  timeout(ms: number): GlobalAbortSignal;
}

// `fetch` and `AbortSignal` are runtime globals in both the Electron main
// process (Node 18+) and the browser, but this package's tsconfig has no
// DOM/Node lib entry for them, so they are looked up dynamically instead of
// named directly.
const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
const globalAbortSignal = (globalThis as { AbortSignal?: GlobalAbortSignalCtor }).AbortSignal;

/**
 * Builds the Gemini `generateContent` request body: the pages' text, in page
 * order with their real page numbers, and instructions to return exactly
 * `request.size` questions as a strict JSON array so the response can be
 * parsed without any prose around it.
 */
function buildRequestBody(request: QuizProviderRequest): unknown {
  const pagesText = request.pages
    .map((page) => `--- Page ${page.page} ---\n${page.text}`)
    .join('\n\n');
  const prompt = `You are writing a reading-comprehension Quiz about the book "${request.title}".
Using only the text below, write exactly ${request.size} Quiz questions mixing true/false and
multiple-choice. Every multiple-choice question has exactly four options; every true/false
question has exactly the two options "True" and "False". Each question has exactly one correct
answer, a short explanation, and the real page number (from the "Page N" markers below) it is
drawn from. Do not ask about anything not in the text below.

Respond with only a JSON array of ${request.size} objects, each shaped exactly like:
{"type": "true_false" | "multiple_choice", "prompt": string, "options": string[], "correctIndex": number, "explanation": string, "sourcePage": number}

${pagesText}`;

  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  };
}

/** Pulls the generated text out of Gemini's response envelope, or null when it is not shaped as expected. */
function extractCandidateText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const candidates = (payload as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0] as Record<string, unknown> | undefined;
  const content = first?.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const text = (parts[0] as Record<string, unknown>).text;
  return typeof text === 'string' ? text : null;
}

function failureForStatus(status: number): QuizProviderFailure {
  // A 401/403 means the key was sent but rejected, which is distinct from no
  // key being configured at all (the caller refuses that before calling us).
  if (status === 401 || status === 403) return { kind: 'invalid-key', detail: `HTTP ${status}` };
  if (status === 429) return { kind: 'rate-limited', detail: `HTTP ${status}` };
  return { kind: 'other', detail: `HTTP ${status}` };
}

/**
 * The Gemini implementation of {@link QuizProviderEngine} (ADR-0007). Calls the
 * Gemini REST API directly with the reader's own key and validates the
 * response with `validateQuizQuestions` before returning it, so a malformed,
 * partial or wrong-count response never reaches `quizService`.
 *
 * @param fetchImpl - Defaults to the platform's global `fetch`; tests inject a fake.
 */
export function createGeminiProvider(fetchImpl: FetchLike = globalFetch as FetchLike): QuizProviderEngine {
  return {
    async generateQuestions(request, apiKey) {
      if (apiKey.trim() === '') return err({ kind: 'missing-key', detail: 'no API key configured' });

      let response;
      try {
        response = await fetchImpl(`${endpoint(GEMINI_MODEL)}?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildRequestBody(request)),
          signal: globalAbortSignal?.timeout(GEMINI_TIMEOUT_MS),
        });
      } catch (error) {
        return err({ kind: 'unreachable', detail: errorMessage(error) });
      }

      if (!response.ok) return err(failureForStatus(response.status));

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        return err({ kind: 'malformed', detail: `response was not JSON: ${errorMessage(error)}` });
      }

      const text = extractCandidateText(payload);
      if (text === null) return err({ kind: 'malformed', detail: 'no candidate text in Gemini response' });

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return err({ kind: 'malformed', detail: `candidate text was not JSON: ${errorMessage(error)}` });
      }

      return validateQuizQuestions(parsed, request);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
