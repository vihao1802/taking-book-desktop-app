import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_TRANSLATION_LENGTH,
  TRANSLATION_TIMEOUT_MS,
  translateText,
  type EngineTranslation,
  type Result,
  type TranslationEngine,
  type TranslationEngineFailure,
} from '../src';

interface FakeEngine extends TranslationEngine {
  calls: { text: string; targetLanguage: string }[];
}

/** An engine that records its calls and always answers with `outcome`. */
function fakeEngine(outcome: Result<EngineTranslation, TranslationEngineFailure>): FakeEngine {
  const calls: { text: string; targetLanguage: string }[] = [];
  return {
    calls,
    translate: async (text, targetLanguage) => {
      calls.push({ text, targetLanguage });
      return outcome;
    },
  };
}

const bonjour = fakeEngine({ ok: true, data: { text: 'hello', sourceLanguage: 'fr' } });

describe('translateText', () => {
  it('returns the Translation with source and target languages', async () => {
    const result = await translateText({ engine: bonjour, text: 'bonjour', targetLanguage: 'en' });
    expect(result).toEqual({
      ok: true,
      data: { text: 'hello', sourceLanguage: 'fr', targetLanguage: 'en' },
    });
  });

  it('passes an unknown source language through as null', async () => {
    const engine = fakeEngine({ ok: true, data: { text: 'hello', sourceLanguage: null } });
    const result = await translateText({ engine, text: 'bonjour', targetLanguage: 'en' });
    expect(result).toEqual({
      ok: true,
      data: { text: 'hello', sourceLanguage: null, targetLanguage: 'en' },
    });
  });

  it('sends the engine trimmed text with whitespace runs and line breaks collapsed', async () => {
    const engine = fakeEngine({ ok: true, data: { text: 'x', sourceLanguage: null } });
    await translateText({ engine, text: '  la  belle\n\tépoque \r\n  ', targetLanguage: 'vi' });
    expect(engine.calls).toEqual([{ text: 'la belle époque', targetLanguage: 'vi' }]);
  });

  it.each(['', '   ', '\n\t \r\n'])('rejects empty or whitespace-only text %j without calling the engine', async (text) => {
    const engine = fakeEngine({ ok: true, data: { text: 'x', sourceLanguage: null } });
    const result = await translateText({ engine, text, targetLanguage: 'en' });
    expect(result.ok).toBe(false);
    expect(engine.calls).toEqual([]);
  });

  it('allows text of exactly the maximum length', async () => {
    const engine = fakeEngine({ ok: true, data: { text: 'x', sourceLanguage: null } });
    const result = await translateText({ engine, text: 'a'.repeat(MAX_TRANSLATION_LENGTH), targetLanguage: 'en' });
    expect(MAX_TRANSLATION_LENGTH).toBe(200);
    expect(result.ok).toBe(true);
  });

  it('rejects text one character over the maximum, telling the reader it is for short phrases', async () => {
    const engine = fakeEngine({ ok: true, data: { text: 'x', sourceLanguage: null } });
    const result = await translateText({ engine, text: 'a'.repeat(MAX_TRANSLATION_LENGTH + 1), targetLanguage: 'en' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/words and short phrases/);
    expect(engine.calls).toEqual([]);
  });

  it('counts the length after whitespace is collapsed', async () => {
    const engine = fakeEngine({ ok: true, data: { text: 'x', sourceLanguage: null } });
    const padded = `  ${'a'.repeat(MAX_TRANSLATION_LENGTH)}\n\n  `;
    const result = await translateText({ engine, text: padded, targetLanguage: 'en' });
    expect(result.ok).toBe(true);
  });

  it('counts characters, not UTF-16 units, so scripts outside the BMP are not cut short', async () => {
    const engine = fakeEngine({ ok: true, data: { text: 'x', sourceLanguage: null } });
    const result = await translateText({ engine, text: '𠀀'.repeat(MAX_TRANSLATION_LENGTH), targetLanguage: 'en' });
    expect(result.ok).toBe(true);
  });

  it('rejects an unsupported Target language without calling the engine', async () => {
    const engine = fakeEngine({ ok: true, data: { text: 'x', sourceLanguage: null } });
    const result = await translateText({ engine, text: 'bonjour', targetLanguage: 'xx' });
    expect(result.ok).toBe(false);
    expect(engine.calls).toEqual([]);
  });

  it.each([
    ['rate-limited', /try again shortly/i],
    ['unreachable', /check your connection/i],
    ['other', /could not translate/i],
  ] as const)('maps a %s engine failure to its reader-facing message', async (kind, message) => {
    const engine = fakeEngine({ ok: false, error: { kind, detail: 'HTTP 429 at https://translate.google.com' } });
    const result = await translateText({ engine, text: 'bonjour', targetLanguage: 'en' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(message);
    expect(result.error).not.toContain('HTTP 429');
    expect(result.error).not.toContain('translate.google.com');
  });

  it('gives each failure kind a different message', async () => {
    const messages = new Set<string>();
    for (const kind of ['rate-limited', 'unreachable', 'other'] as const) {
      const engine = fakeEngine({ ok: false, error: { kind, detail: 'boom' } });
      const result = await translateText({ engine, text: 'bonjour', targetLanguage: 'en' });
      if (!result.ok) messages.add(result.error);
    }
    expect(messages.size).toBe(3);
  });

  it('reports each engine failure with its kind and detail so the platform can log it', async () => {
    const engine = fakeEngine({ ok: false, error: { kind: 'rate-limited', detail: 'HTTP 429' } });
    const onEngineFailure = vi.fn();
    await translateText({ engine, text: 'bonjour', targetLanguage: 'en', onEngineFailure });
    expect(onEngineFailure).toHaveBeenCalledExactlyOnceWith({ kind: 'rate-limited', detail: 'HTTP 429' });
  });

  it('does not report a failure for a successful Translation or text rejected before the engine', async () => {
    const onEngineFailure = vi.fn();
    await translateText({ engine: bonjour, text: 'bonjour', targetLanguage: 'en', onEngineFailure });
    await translateText({ engine: bonjour, text: '   ', targetLanguage: 'en', onEngineFailure });
    expect(onEngineFailure).not.toHaveBeenCalled();
  });

  it('treats an engine that rejects despite its contract as an other failure, never showing the raw error', async () => {
    const engine: TranslationEngine = { translate: () => Promise.reject(new Error('socket hang up at 10.0.0.1')) };
    const onEngineFailure = vi.fn();
    const result = await translateText({ engine, text: 'bonjour', targetLanguage: 'en', onEngineFailure });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/could not translate/i);
    expect(result.error).not.toContain('socket');
    expect(onEngineFailure).toHaveBeenCalledExactlyOnceWith({ kind: 'other', detail: expect.stringContaining('socket hang up') });
  });

  describe('when the engine hangs', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const hangingEngine: TranslationEngine = { translate: () => new Promise(() => {}) };

    it('ends with the unreachable message once the timeout passes', async () => {
      vi.useFakeTimers();
      const onEngineFailure = vi.fn();
      const pending = translateText({ engine: hangingEngine, text: 'bonjour', targetLanguage: 'en', onEngineFailure });
      await vi.advanceTimersByTimeAsync(TRANSLATION_TIMEOUT_MS);
      const result = await pending;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/check your connection/i);
      expect(onEngineFailure).toHaveBeenCalledExactlyOnceWith({ kind: 'unreachable', detail: expect.stringMatching(/timed out/i) });
    });

    it('is still waiting just before the timeout', async () => {
      vi.useFakeTimers();
      let settled = false;
      void translateText({ engine: hangingEngine, text: 'bonjour', targetLanguage: 'en', timeoutMs: 500 }).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(499);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    });

    it('clears its timer when the engine answers in time', async () => {
      vi.useFakeTimers();
      await translateText({ engine: bonjour, text: 'bonjour', targetLanguage: 'en' });
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
