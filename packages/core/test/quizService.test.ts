import { describe, expect, it } from 'vitest';
import { createMemoryDriver } from './helpers';
import {
  MISSING_KEY_MESSAGE,
  NO_TEXT_MESSAGE,
  QUIZ_SIZES,
  generateQuiz,
  isErr,
  isOk,
  listQuizzesForBook,
  quizSchema,
} from '../src/index';
import type { QuizProviderEngine, QuizProviderQuestion, SqlDriver } from '../src/index';

async function setup(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await db.exec(quizSchema());
  return db;
}

const twoQuestions: QuizProviderQuestion[] = [
  { type: 'true_false', prompt: 'Q1', options: ['True', 'False'], correctIndex: 0, explanation: 'E1', sourcePage: 8 },
  { type: 'true_false', prompt: 'Q2', options: ['True', 'False'], correctIndex: 1, explanation: 'E2', sourcePage: 9 },
];

function fakeEngine(questions: QuizProviderQuestion[]): QuizProviderEngine & { calls: number } {
  const engine = {
    calls: 0,
    async generateQuestions() {
      engine.calls += 1;
      return { ok: true as const, data: questions };
    },
  };
  return engine;
}

/** A fake engine that returns exactly the requested number of questions, so a stored Quiz's size column matches the request it was made from. */
function sizedEngine(): QuizProviderEngine & { calls: number } {
  const engine = {
    calls: 0,
    async generateQuestions(request: { size: number }) {
      engine.calls += 1;
      const questions: QuizProviderQuestion[] = Array.from({ length: request.size }, (_, i) => ({
        type: 'true_false',
        prompt: `Q${i + 1}`,
        options: ['True', 'False'],
        correctIndex: 0,
        explanation: `E${i + 1}`,
        sourcePage: 8,
      }));
      return { ok: true as const, data: questions };
    },
  };
  return engine;
}

function failingEngine(kind: 'rate-limited' | 'unreachable' | 'malformed' | 'other'): QuizProviderEngine {
  return {
    async generateQuestions() {
      return { ok: false, error: { kind, detail: 'boom' } };
    },
  };
}

const pages = Array.from({ length: 10 }, (_, i) => ({ page: i + 1, text: `text of page ${i + 1}` }));

describe('generateQuiz', () => {
  it('generates and stores a Quiz within the resolved scope', async () => {
    const db = await setup();
    const engine = fakeEngine(twoQuestions);
    const result = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.data.scopeEndPage).toBe(10);
    expect(result.data.questions).toHaveLength(2);
    expect(engine.calls).toBe(1);
  });

  it.each(QUIZ_SIZES)('accepts a size of %i questions', async (size) => {
    const db = await setup();
    const engine = fakeEngine(twoQuestions);
    const result = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(result)).toBe(true);
    expect(result.data?.questions).toHaveLength(2);
  });

  it('fails with a clear message when no AI provider key is saved, and stores nothing', async () => {
    const db = await setup();
    const engine = fakeEngine(twoQuestions);
    const result = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: null,
    });
    expect(isErr(result) && result.error).toBe(MISSING_KEY_MESSAGE);
    expect(engine.calls).toBe(0);
    const listed = await listQuizzesForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data).toEqual([]);
  });

  it('never sends text past the Last-read position to the provider', async () => {
    const db = await setup();
    let sentPages: number[] = [];
    const engine: QuizProviderEngine = {
      async generateQuestions(request) {
        sentPages = request.pages.map((p) => p.page);
        return { ok: true, data: twoQuestions };
      },
    };
    await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 4,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(Math.max(...sentPages)).toBeLessThanOrEqual(4);
  });

  it('widens the scope to a reader-chosen earlier start page', async () => {
    const db = await setup();
    let sentPages: number[] = [];
    const engine: QuizProviderEngine = {
      async generateQuestions(request) {
        sentPages = request.pages.map((p) => p.page);
        return { ok: true, data: twoQuestions };
      },
    };
    const result = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      scopeStartPage: 2,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(result) && result.data.scopeStartPage).toBe(2);
    expect(Math.min(...sentPages)).toBe(2);
  });

  it('fails with a clear message when the scope has no extractable text, and stores nothing', async () => {
    const db = await setup();
    const engine = fakeEngine(twoQuestions);
    const blankPages = pages.map((p) => ({ ...p, text: '   ' }));
    const result = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages: blankPages,
      engine,
      apiKey: 'key',
    });
    expect(isErr(result) && result.error).toBe(NO_TEXT_MESSAGE);
    expect(engine.calls).toBe(0);
  });

  it('surfaces a clear message on provider failure and leaves existing Quizzes untouched', async () => {
    const db = await setup();
    const first = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine: fakeEngine(twoQuestions),
      apiKey: 'key',
    });
    expect(isOk(first)).toBe(true);

    const failed = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine: failingEngine('rate-limited'),
      apiKey: 'key',
    });
    expect(isErr(failed) && failed.error).toMatch(/busy/);

    const listed = await listQuizzesForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data).toHaveLength(1);
  });

  it('reuses the saved questions for an identical request without calling the provider again', async () => {
    const db = await setup();
    const engine = sizedEngine();
    const first = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(first)).toBe(true);

    const second = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(second) && second.data.id).toBe(isOk(first) ? first.data.id : undefined);
    expect(engine.calls).toBe(1);
    const listed = await listQuizzesForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data).toHaveLength(1);
  });

  it('opens a saved Quiz offline, with no key and no provider call', async () => {
    const db = await setup();
    const engine = sizedEngine();
    const first = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(first)).toBe(true);

    const offline = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: null,
    });
    expect(isOk(offline) && offline.data.id).toBe(isOk(first) ? first.data.id : undefined);
    expect(engine.calls).toBe(1);
  });

  it('does not reuse saved questions for a different size', async () => {
    const db = await setup();
    const engine = sizedEngine();
    await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    const other = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 10,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(other)).toBe(true);
    expect(engine.calls).toBe(2);
  });

  it('does not reuse saved questions for a different scope', async () => {
    const db = await setup();
    const engine = sizedEngine();
    await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    const widened = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      scopeStartPage: 2,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(widened)).toBe(true);
    expect(engine.calls).toBe(2);
  });

  it('does not reuse saved questions for another Book', async () => {
    const db = await setup();
    const engine = sizedEngine();
    await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    const other = await generateQuiz(db, {
      fileHash: 'hash-2',
      title: 'Other',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(other)).toBe(true);
    expect(engine.calls).toBe(2);
  });

  it('a Retake with new questions calls the provider and saves the new set', async () => {
    const db = await setup();
    const engine = sizedEngine();
    const first = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });
    expect(isOk(first)).toBe(true);

    const retake = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
      forceNew: true,
    });
    expect(isOk(retake)).toBe(true);
    expect(engine.calls).toBe(2);
    expect(retake.data?.id).not.toBe(isOk(first) ? first.data.id : undefined);

    const listed = await listQuizzesForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data).toHaveLength(2);
  });

  it('a Retake with new questions needs a key even when a saved Quiz exists', async () => {
    const db = await setup();
    const engine = sizedEngine();
    await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: 'key',
    });

    const retake = await generateQuiz(db, {
      fileHash: 'hash-1',
      title: 'Book',
      lastPage: 10,
      size: 5,
      pages,
      engine,
      apiKey: null,
      forceNew: true,
    });
    expect(isErr(retake) && retake.error).toBe(MISSING_KEY_MESSAGE);
    expect(engine.calls).toBe(1);
    const listed = await listQuizzesForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data).toHaveLength(1);
  });
});
