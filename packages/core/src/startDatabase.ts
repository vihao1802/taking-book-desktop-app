import { annotationsSchema, migrateAnnotationsSchema } from './annotationsRepository';
import { customSoundsSchema } from './customSoundsRepository';
import { filesSchema } from './filesRepository';
import { quizSchema } from './quiz/quizRepository';
import { readingSessionsSchema } from './readingSessionsRepository';
import { err, ok, type Result } from './result';
import { settingsSchema } from './settingsRepository';
import type { SqlDriver } from './sql';
import { migrateFilesSchema } from './sync/syncRepository';

/**
 * Brings a database up to the current schema: creates every missing table, then
 * runs the file and annotation migrations in order. Idempotent, so every
 * platform calls it on each start, on fresh and previously-migrated databases
 * alike.
 *
 * @param db The opened database, already configured by the platform (for
 *   example foreign keys on).
 * @returns An error when the tables cannot be created, since nothing works
 *   without them. Otherwise ok, carrying the migration failures (empty when all
 *   succeeded); the migrations run independently, so one failing does not skip
 *   the other, and a failed annotation migration means new annotations cannot
 *   be saved.
 */
export async function startDatabase(db: SqlDriver): Promise<Result<string[]>> {
  try {
    await db.exec(
      [filesSchema(), settingsSchema(), readingSessionsSchema(), annotationsSchema(), customSoundsSchema(), quizSchema()].join(' '),
    );
  } catch (error) {
    return err(`Failed to create database tables: ${error instanceof Error ? error.message : String(error)}`);
  }
  const migrations = [await migrateFilesSchema(db), await migrateAnnotationsSchema(db)];
  const failures: string[] = [];
  for (const migration of migrations) {
    if (!migration.ok) failures.push(migration.error);
  }
  return ok(failures);
}
