// Stops the app started by start.mjs and deletes its throwaway profile.
// It signals the whole process group, which ends npx, Forge, Vite and every
// Electron process together without matching command lines (a `pkill -f`
// on the flags would also kill the shell that runs it).
import { rmSync } from 'node:fs';
import { STATE_DIR, readPid } from './state.mjs';

const pid = readPid();
if (pid === null) {
  console.log('No UI check app is running.');
} else {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (error) {
    console.log(`Process group ${pid} was already gone (${error.code}).`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Already exited after SIGTERM, which is the normal case.
  }
  rmSync(STATE_DIR, { recursive: true, force: true });
  console.log('App stopped and throwaway profile deleted.');
}
