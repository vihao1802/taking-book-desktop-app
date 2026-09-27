import type { Result } from '../result';
import { err, isErr, ok } from '../result';
import type { SqlDriver, SqlValue } from '../sql';
import type { Quiz, QuizAnswerInput, QuizAttempt, QuizAttemptAnswer, QuizQuestion, QuizQuestionType } from './models';
import { scoreAnswers, totalCorrect } from './quizScoring';
import type { QuizProviderQuestion } from './quizProvider';
import type { QuizScope } from './quizScope';

/**
 * Data access for Quizzes, their questions and the attempts a reader makes on
 * them. Everything is per-Book by content hash, device-local and never synced
 * (see the `Quiz attempt` glossary entry), so these tables carry no sync clock
 * and no tombstones, unlike `annotationsRepository`.
 */

/** Returns the schema DDL for the Quiz tables. */
export function quizSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_hash TEXT NOT NULL,
      scope_start_page INTEGER NOT NULL,
      scope_end_page INTEGER NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_quizzes_file ON quizzes(file_hash);

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      source_page INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      file_hash TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_file ON quiz_attempts(file_hash);

    CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL,
      selected_index INTEGER NOT NULL,
      correct INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_attempt_answers_attempt ON quiz_attempt_answers(attempt_id);
  `;
}

interface QuestionRow {
  id: number;
  quiz_id: number;
  order_index: number;
  type: string;
  prompt: string;
  options: string;
  correct_index: number;
  explanation: string;
  source_page: number;
}

function toQuestion(row: QuestionRow): QuizQuestion {
  return {
    id: row.id,
    quizId: row.quiz_id,
    orderIndex: row.order_index,
    type: row.type as QuizQuestionType,
    prompt: row.prompt,
    options: JSON.parse(row.options) as string[],
    correctIndex: row.correct_index,
    explanation: row.explanation,
    sourcePage: row.source_page,
  };
}

async function loadQuestions(db: SqlDriver, quizId: number): Promise<QuizQuestion[]> {
  const rows = await db.all('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index', [quizId]);
  return rows.map((row) => toQuestion(row as unknown as QuestionRow));
}

/**
 * Stores a freshly generated Quiz and its questions, so a failure partway
 * through never leaves a Quiz with some of its questions missing: it is
 * cleaned up instead of left orphaned.
 *
 * @param db - The data-access driver.
 * @param fileHash - Content hash of the Book the Quiz belongs to.
 * @param scope - The resolved page range the questions were drawn from.
 * @param questions - The provider's already-validated questions, in order.
 * @returns The stored Quiz with its questions, or an error message.
 */
export async function createQuiz(
  db: SqlDriver,
  fileHash: string,
  scope: QuizScope,
  questions: QuizProviderQuestion[],
): Promise<Result<Quiz>> {
  // Not wrapped in `db.transaction`: better-sqlite3's transaction wrapper only
  // accepts a synchronous function, and rejects (then rolls back) as soon as
  // an async one returns a promise, which would abort partway between these
  // two inserts. Sequential awaits match how the rest of `/core` writes
  // multi-row records (see `annotationsRepository`); a failure partway through
  // the questions loop below deletes the partial quiz row instead of leaving
  // it orphaned with fewer questions than its own `size` column claims.
  let quizId: number | undefined;
  try {
    const inserted = await db.run(
      'INSERT INTO quizzes (file_hash, scope_start_page, scope_end_page, size) VALUES (?, ?, ?, ?)',
      [fileHash, scope.startPage, scope.endPage, questions.length],
    );
    quizId = inserted.lastInsertRowid;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await db.run(
        `INSERT INTO quiz_questions (quiz_id, order_index, type, prompt, options, correct_index, explanation, source_page)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [quizId, i, q.type, q.prompt, JSON.stringify(q.options), q.correctIndex, q.explanation, q.sourcePage],
      );
    }
    return getQuiz(db, quizId);
  } catch (error) {
    let cleanupDetail = '';
    if (quizId !== undefined) {
      // ON DELETE CASCADE removes any questions that made it in before the failure.
      try {
        await db.run('DELETE FROM quizzes WHERE id = ?', [quizId]);
      } catch (cleanupError) {
        // `/core` has no logger of its own (no console without a DOM/Node lib
        // entry); folding this into the returned message keeps it from being
        // silently dropped, since every caller here logs a failed Result.
        cleanupDetail = ` (and the partial Quiz ${quizId} could not be cleaned up: ${errorMessage(cleanupError)})`;
      }
    }
    return err(`Failed to save Quiz for ${fileHash}: ${errorMessage(error)}${cleanupDetail}`);
  }
}

/** Reads one Quiz with its questions, by local id. */
export async function getQuiz(db: SqlDriver, quizId: number): Promise<Result<Quiz>> {
  try {
    const row = await db.get('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (!row) return err(`No Quiz with id ${quizId}`);
    const questions = await loadQuestions(db, quizId);
    return ok({
      id: Number(row.id),
      fileHash: String(row.file_hash),
      scopeStartPage: Number(row.scope_start_page),
      scopeEndPage: Number(row.scope_end_page),
      size: Number(row.size),
      createdAt: String(row.created_at),
      questions,
    });
  } catch (error) {
    return err(`Failed to read Quiz ${quizId}: ${errorMessage(error)}`);
  }
}

/** Lists a Book's Quizzes, most recently generated first, each with its questions. */
export async function listQuizzesForBook(db: SqlDriver, fileHash: string): Promise<Result<Quiz[]>> {
  try {
    const rows = await db.all('SELECT id FROM quizzes WHERE file_hash = ? ORDER BY id DESC', [fileHash]);
    const quizzes: Quiz[] = [];
    for (const row of rows) {
      const quiz = await getQuiz(db, Number(row.id));
      if (isErr(quiz)) return quiz;
      quizzes.push(quiz.data);
    }
    return ok(quizzes);
  } catch (error) {
    return err(`Failed to list Quizzes for ${fileHash}: ${errorMessage(error)}`);
  }
}

function toAttemptAnswer(row: Record<string, SqlValue>): QuizAttemptAnswer {
  return {
    questionId: Number(row.question_id),
    selectedIndex: Number(row.selected_index),
    correct: Number(row.correct) !== 0,
  };
}

/**
 * Scores and stores a Quiz attempt in one transaction. The correct answers
 * come from the stored questions, never from the caller, so a tampered or
 * stale answer set cannot inflate the score.
 *
 * @param db - The data-access driver.
 * @param quizId - The Quiz the reader took.
 * @param fileHash - Content hash of the Book, stored alongside for lookups that do not have the Quiz id.
 * @param answers - The reader's answers, one per question.
 * @returns The stored attempt with its score, or an error message when the Quiz does not exist.
 */
export async function saveQuizAttempt(
  db: SqlDriver,
  quizId: number,
  fileHash: string,
  answers: QuizAnswerInput[],
): Promise<Result<QuizAttempt>> {
  try {
    const questions = await loadQuestions(db, quizId);
    if (questions.length === 0) return err(`No Quiz with id ${quizId}`);
    const scored = scoreAnswers(questions, answers);
    const score = totalCorrect(scored);

    // See the comment in `createQuiz`: `db.transaction` cannot host this
    // async, multi-insert body, so these run as sequential awaits instead.
    const inserted = await db.run(
      'INSERT INTO quiz_attempts (quiz_id, file_hash, score, total) VALUES (?, ?, ?, ?)',
      [quizId, fileHash, score, questions.length],
    );
    const attemptId = inserted.lastInsertRowid;
    for (const answer of scored) {
      await db.run(
        'INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_index, correct) VALUES (?, ?, ?, ?)',
        [attemptId, answer.questionId, answer.selectedIndex, answer.correct ? 1 : 0],
      );
    }
    const row = await db.get('SELECT * FROM quiz_attempts WHERE id = ?', [attemptId]);
    if (!row) return err(`Attempt ${attemptId} vanished after insert`);
    return ok({
      id: attemptId,
      quizId,
      fileHash,
      score,
      total: questions.length,
      completedAt: String(row.completed_at),
      answers: scored,
    });
  } catch (error) {
    return err(`Failed to save Quiz attempt for Quiz ${quizId}: ${errorMessage(error)}`);
  }
}

/** Lists a Book's Quiz attempts, most recent first, each with its scored answers. */
export async function listQuizAttemptsForBook(db: SqlDriver, fileHash: string): Promise<Result<QuizAttempt[]>> {
  try {
    const rows = await db.all(
      'SELECT * FROM quiz_attempts WHERE file_hash = ? ORDER BY id DESC',
      [fileHash],
    );
    const attempts: QuizAttempt[] = [];
    for (const row of rows) {
      const answerRows = await db.all('SELECT * FROM quiz_attempt_answers WHERE attempt_id = ?', [row.id]);
      attempts.push({
        id: Number(row.id),
        quizId: Number(row.quiz_id),
        fileHash: String(row.file_hash),
        score: Number(row.score),
        total: Number(row.total),
        completedAt: String(row.completed_at),
        answers: answerRows.map(toAttemptAnswer),
      });
    }
    return ok(attempts);
  } catch (error) {
    return err(`Failed to list Quiz attempts for ${fileHash}: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
