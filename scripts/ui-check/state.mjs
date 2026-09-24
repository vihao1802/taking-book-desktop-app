// Where a UI check keeps its throwaway profile, fixture, log and process id.
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const STATE_DIR = process.env.TB_UI_CHECK_DIR ?? join(tmpdir(), 'tb-ui-check');

/** The process-group id of the running check app, or null when none was started. */
export function readPid() {
  try {
    return Number(readFileSync(join(STATE_DIR, 'pid'), 'utf8'));
  } catch {
    // No pid file means no app was started (or it was already stopped).
    return null;
  }
}
