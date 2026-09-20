import Database from 'better-sqlite3';
import { createAnnotation as createAnnotationWithUid } from '../src/annotationsRepository';
import type { Annotation, CreateAnnotationInput } from '../src/models';
import type { Result } from '../src/result';
import type { SqlDriver, SqlRunResult, SqlValue } from '../src/sql';
import type { SyncStamp, SyncStorage } from '../src/sync/types';

/**
 * Test-only adapter: backs the platform-agnostic SqlDriver interface with
 * better-sqlite3 in memory. Production adapters live in each platform package.
 */
export function createMemoryDriver(): SqlDriver {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  function toRunResult(info: Database.RunResult): SqlRunResult {
    return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
  }

  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      return toRunResult(db.prepare(sql).run(...(params as unknown[])));
    },
    async get(sql, params = []) {
      const row = db.prepare(sql).get(...(params as unknown[]));
      if (row === undefined) return undefined;
      return normalizeRow(row);
    },
    async all(sql, params = []) {
      const rows = db.prepare(sql).all(...(params as unknown[]));
      return rows.map(normalizeRow);
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      return db.transaction(fn)();
    },
  };
}

function normalizeRow(row: unknown): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      out[key] = value;
    } else if (typeof value === 'bigint') {
      out[key] = Number(value);
    } else if (typeof value === 'boolean') {
      out[key] = value ? 1 : 0;
    }
  }
  return out;
}

let testUidCounter = 0;

/** Returns a uid generator that yields `<prefix>-1`, `<prefix>-2`, ... for one simulated device. */
export function sequentialUids(prefix: string): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

/**
 * Creates an annotation with a process-unique uid, for tests that do not care
 * about identity. Tests about identity pass their own generator to core.
 */
export function createAnnotation(
  db: SqlDriver,
  fileHash: string,
  input: CreateAnnotationInput,
  stamp?: SyncStamp,
): Promise<Result<Annotation>> {
  return createAnnotationWithUid(db, fileHash, input, {
    stamp,
    generateUid: () => {
      testUidCounter += 1;
      return `test-uid-${testUidCounter}`;
    },
  });
}

/** In-memory cloud-drive folder, shared by simulated devices in a test. */
export function createMemoryStorage(): SyncStorage & { dump(): Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    async readFile(key) {
      return { ok: true, data: files.get(key) ?? null };
    },
    async writeFile(key, data) {
      files.set(key, data);
      return { ok: true, data: undefined };
    },
    async deleteFile(key) {
      files.delete(key);
      return { ok: true, data: undefined };
    },
    async listFiles(prefix) {
      return { ok: true, data: [...files.keys()].filter((key) => key.startsWith(prefix)) };
    },
    dump() {
      return files;
    },
  };
}
