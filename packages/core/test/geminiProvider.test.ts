import { describe, expect, it } from 'vitest';
import { createGeminiProvider, isErr, isOk } from '../src/index';
import type { FetchLike, QuizProviderRequest } from '../src/index';

function request(size = 2): QuizProviderRequest {
  return {
    title: 'Book',
    pages: [
      { page: 1, text: 'Once upon a time.' },
      { page: 2, text: 'The end.' },
    ],
    size,
  };
}

/** Wraps a Gemini `generateContent` response envelope around a candidate text payload, as the recorded fixtures below do. */
function geminiEnvelope(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function fakeFetch(status: number, payload: unknown): FetchLike {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

const validQuestions = [
  {
    type: 'true_false',
    prompt: 'The story starts with "Once upon a time."',
    options: ['True', 'False'],
    correctIndex: 0,
    explanation: 'Page 1 opens with that line.',
    sourcePage: 1,
  },
  {
    type: 'multiple_choice',
    prompt: 'How does the story end?',
    options: ['The end.', 'To be continued.', 'Happily ever after.', 'The beginning.'],
    correctIndex: 0,
    explanation: 'Page 2 says "The end."',
    sourcePage: 2,
  },
];

describe('createGeminiProvider', () => {
  it('returns questions from a valid recorded response', async () => {
    const provider = createGeminiProvider(fakeFetch(200, geminiEnvelope(JSON.stringify(validQuestions))));
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isOk(result)).toBe(true);
  });

  it('rejects a malformed recorded response (candidate text is not JSON)', async () => {
    const provider = createGeminiProvider(fakeFetch(200, geminiEnvelope('not json')));
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isErr(result) && result.error.kind).toBe('malformed');
  });

  it('rejects a partial recorded response (a question missing required fields)', async () => {
    const partial = [{ type: 'true_false', prompt: 'p', options: ['True', 'False'] }];
    const provider = createGeminiProvider(fakeFetch(200, geminiEnvelope(JSON.stringify(partial))));
    const result = await provider.generateQuestions(request(1), 'test-key');
    expect(isErr(result) && result.error.kind).toBe('malformed');
  });

  it('rejects a recorded response with the wrong question count', async () => {
    const provider = createGeminiProvider(fakeFetch(200, geminiEnvelope(JSON.stringify([validQuestions[0]]))));
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isErr(result) && result.error.detail).toMatch(/expected 2 questions, got 1/);
  });

  it('rejects an empty response envelope (no candidates)', async () => {
    const provider = createGeminiProvider(fakeFetch(200, { candidates: [] }));
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isErr(result) && result.error.kind).toBe('malformed');
  });

  it('maps a 429 status to a rate-limited failure', async () => {
    const provider = createGeminiProvider(fakeFetch(429, {}));
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isErr(result) && result.error.kind).toBe('rate-limited');
  });

  it('maps a 403 status to an invalid-key failure (a key was sent but rejected)', async () => {
    const provider = createGeminiProvider(fakeFetch(403, {}));
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isErr(result) && result.error.kind).toBe('invalid-key');
  });

  it('maps a 401 status to an invalid-key failure', async () => {
    const provider = createGeminiProvider(fakeFetch(401, {}));
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isErr(result) && result.error.kind).toBe('invalid-key');
  });

  it('maps a network rejection to an unreachable failure', async () => {
    const throwingFetch: FetchLike = async () => {
      throw new Error('network down');
    };
    const provider = createGeminiProvider(throwingFetch);
    const result = await provider.generateQuestions(request(2), 'test-key');
    expect(isErr(result) && result.error.kind).toBe('unreachable');
  });

  it('rejects an empty API key without calling the network', async () => {
    let called = false;
    const provider = createGeminiProvider(async () => {
      called = true;
      return { ok: true, status: 200, json: async () => geminiEnvelope('[]') };
    });
    const result = await provider.generateQuestions(request(2), '   ');
    expect(isErr(result) && result.error.kind).toBe('missing-key');
    expect(called).toBe(false);
  });
});
