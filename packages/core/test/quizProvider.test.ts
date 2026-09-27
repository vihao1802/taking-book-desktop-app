import { describe, expect, it } from 'vitest';
import { createQuizProviderEngine, isErr, isOk } from '../src/index';
import type { QuizProviderEngine } from '../src/index';

const fakeGeminiEngine: QuizProviderEngine = {
  async generateQuestions() {
    return { ok: true, data: [] };
  },
};

describe('createQuizProviderEngine', () => {
  it('returns the engine registered for the requested kind', () => {
    const result = createQuizProviderEngine('gemini', { gemini: fakeGeminiEngine });
    expect(isOk(result) && result.data).toBe(fakeGeminiEngine);
  });

  it('fails with a clear message when no engine is registered for the kind', () => {
    const result = createQuizProviderEngine('gemini', {});
    expect(isErr(result) && result.error).toMatch(/No AI provider is registered for "gemini"/);
  });
});
