// Runs the shared SqlDriver contract on a connected device or emulator against the
// real Capacitor SQLite plugin. Builds a debug APK with VITE_TB_DEVICE_CHECK set,
// installs it, starts it and reads the TB_DEVICE_CHECK lines from logcat.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ID = 'dev.takingbook.app';
const TIMEOUT_MS = 120_000;
const POLL_MS = 2_000;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: mobileDir, stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(' ')} failed.`);
    process.exit(result.status ?? 1);
  }
}

function adb(args) {
  return spawnSync('adb', args, { cwd: mobileDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForResult() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const lines = adb(['logcat', '-d']).stdout.split('\n').filter((line) => line.includes('TB_DEVICE_CHECK:'));
    if (lines.some((line) => line.includes('TB_DEVICE_CHECK: DONE'))) return lines;
    await sleep(POLL_MS);
  }
  return null;
}

function restoreNormalBuild() {
  console.log('Rebuilding the normal web bundle so the check is not left in android/.');
  run('npm', ['run', 'build'], { env: { ...process.env, VITE_TB_DEVICE_CHECK: '' } });
  run('npx', ['cap', 'sync', 'android']);
}

run('npm', ['run', 'build'], { env: { ...process.env, VITE_TB_DEVICE_CHECK: '1' } });
run('npx', ['cap', 'sync', 'android']);
run('node', ['scripts/build-debug-apk.mjs']);
run('adb', ['install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk']);
adb(['logcat', '-c']);
adb(['shell', 'am', 'force-stop', APP_ID]);
adb(['shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);

const lines = await waitForResult();
restoreNormalBuild();
if (lines === null) {
  console.error('No TB_DEVICE_CHECK result within the time limit.');
  process.exit(1);
}
for (const line of lines) console.log(line.slice(line.indexOf('TB_DEVICE_CHECK:')));
process.exit(lines.some((line) => /DONE .*failed=0\b/.test(line)) ? 0 : 1);
