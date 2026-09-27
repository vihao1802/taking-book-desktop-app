import { describe, expect, it } from 'vitest';
import { createMemoryDriver } from './helpers';
import {
  createQuiz,
  filesSchema,
  findQuizForRequest,
  getQuiz,
  isErr,
  isOk,
  listQuizAttemptsForBook,
  listQuizzesForBook,
  quizSchema,
  saveQuizAttempt,
} from '../src/index';
import type { QuizProviderQuestion, SqlDriver } from '../src/index';

async function setup(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await db.exec(`${filesSchema()} ${quizSchema()}`);
  return db;
}

const twoQuestions: QuizProviderQuestion[] = [
  {
    type: 'true_false',
    prompt: 'Q1',
    options: ['True', 'False'],
    correctIndex: 0,
    explanation: 'E1',
    sourcePage: 3,
  },
  {
    type: 'multiple_choice',
    prompt: 'Q2',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 2,
    explanation: 'E2',
    sourcePage: 5,
  },
];

describe('quizRepository', () => {
  it('stores a Quiz with its questions and reads it back in order', async () => {
    const db = await setup();
    const created = await createQuiz(db, 'hash-1', { startPage: 1, endPage: 5 }, twoQuestions);
    expect(isOk(created)).toBe(true);
    if (!isOk(created)) return;
    expect(created.data.fileHash).toBe('hash-1');
    expect(created.data.scopeStartPage).toBe(1);
    expect(created.data.scopeEndPage).toBe(5);
    expect(created.data.questions.map((q) => q.prompt)).toEqual(['Q1', 'Q2']);
    expect(created.data.questions[1].options).toEqual(['A', 'B', 'C', 'D']);

    const fetched = await getQuiz(db, created.data.id);
    expect(isOk(fetched) && fetched.data).toEqual(created.data);
  });

  it('lists a book’s quizzes most-recently-generated first', async () => {
    const db = await setup();
    const first = await createQuiz(db, 'hash-1', { startPage: 1, endPage: 5 }, twoQuestions);
    const second = await createQuiz(db, 'hash-1', { startPage: 1, endPage: 10 }, twoQuestions);
    if (!isOk(first) || !isOk(second)) throw new Error('setup failed');

    const listed = await listQuizzesForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data.map((q) => q.id)).toEqual([second.data.id, first.data.id]);
  });

  it('scores and stores an attempt from the stored correct answers, not the caller’s claim', async () => {
    const db = await setup();
    const quiz = await createQuiz(db, 'hash-1', { startPage: 1, endPage: 5 }, twoQuestions);
    if (!isOk(quiz)) throw new Error('setup failed');
    const [q1, q2] = quiz.data.questions;

    const attempt = await saveQuizAttempt(db, quiz.data.id, 'hash-1', [
      { questionId: q1.id, selectedIndex: 0 }, // correct
      { questionId: q2.id, selectedIndex: 0 }, // incorrect (correct is 2)
    ]);
    expect(isOk(attempt)).toBe(true);
    if (!isOk(attempt)) return;
    expect(attempt.data.score).toBe(1);
    expect(attempt.data.total).toBe(2);
    expect(attempt.data.answers).toEqual([
      { questionId: q1.id, selectedIndex: 0, correct: true },
      { questionId: q2.id, selectedIndex: 0, correct: false },
    ]);
  });

  it('lists attempts for a book, most recent first', async () => {
    const db = await setup();
    const quiz = await createQuiz(db, 'hash-1', { startPage: 1, endPage: 5 }, twoQuestions);
    if (!isOk(quiz)) throw new Error('setup failed');
    const [q1, q2] = quiz.data.questions;
    const answers = [{ questionId: q1.id, selectedIndex: 0 }, { questionId: q2.id, selectedIndex: 2 }];

    const first = await saveQuizAttempt(db, quiz.data.id, 'hash-1', answers);
    const second = await saveQuizAttempt(db, quiz.data.id, 'hash-1', answers);
    if (!isOk(first) || !isOk(second)) throw new Error('setup failed');

    const listed = await listQuizAttemptsForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data.map((a) => a.id)).toEqual([second.data.id, first.data.id]);
    expect(isOk(listed) && listed.data[0].score).toBe(2);
  });

  it('fails to save an attempt for a Quiz that does not exist, leaving no partial row', async () => {
    const db = await setup();
    const attempt = await saveQuizAttempt(db, 999, 'hash-1', []);
    expect(isErr(attempt)).toBe(true);
    const listed = await listQuizAttemptsForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data).toEqual([]);
  });

  it('cleans up an orphaned Quiz row when a question insert fails partway through', async () => {
    const db = await setup();
    // Fails the insert for the second question, simulating a transient error mid-save.
    let questionInserts = 0;
    const failingDb: SqlDriver = {
      ...db,
      run: async (sql, params) => {
        if (sql.includes('INSERT INTO quiz_questions')) {
          questionInserts += 1;
          if (questionInserts === 2) throw new Error('simulated write failure');
        }
        return db.run(sql, params);
      },
    };

    const result = await createQuiz(failingDb, 'hash-1', { startPage: 1, endPage: 5 }, twoQuestions);
    expect(isErr(result)).toBe(true);

    const listed = await listQuizzesForBook(db, 'hash-1');
    expect(isOk(listed) && listed.data).toEqual([]);
  });

  it('finds the most recent saved Quiz matching a Book, page range and size', async () => {
    const db = await setup();
    const none = await findQuizForRequest(db, 'hash-1', { startPage: 1, endPage: 5 }, 2);
    expect(isOk(none) && none.data).toBeNull();

    const first = await createQuiz(db, 'hash-1', { startPage: 1, endPage: 5 }, twoQuestions);
    const second = await createQuiz(db, 'hash-1', { startPage: 1, endPage: 5 }, twoQuestions);
    if (!isOk(first) || !isOk(second)) throw new Error('setup failed');

    const found = await findQuizForRequest(db, 'hash-1', { startPage: 1, endPage: 5 }, 2);
    expect(isOk(found) && found.data?.id).toBe(second.data.id);

    // A different page range or size must not match the same request.
    const otherScope = await findQuizForRequest(db, 'hash-1', { startPage: 1, endPage: 10 }, 2);
    expect(isOk(otherScope) && otherScope.data).toBeNull();
    const otherSize = await findQuizForRequest(db, 'hash-1', { startPage: 1, endPage: 5 }, 10);
    expect(isOk(otherSize) && otherSize.data).toBeNull();
    const otherBook = await findQuizForRequest(db, 'hash-2', { startPage: 1, endPage: 5 }, 2);
    expect(isOk(otherBook) && otherBook.data).toBeNull();
  });
});
