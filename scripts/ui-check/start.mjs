// Starts the desktop app for a UI check: a throwaway profile (so the user's
// real library, notes and cloud sync are never touched), debug ports for the
// window and the main process, and a fixture PDF behind the "Add PDF" dialog.
//
// The window is hidden by default, so nothing shows on the user's screen while
// CDP still screenshots and drives it. Pass --visible to watch it instead.
// (Chromium's --ozone-platform=headless would avoid the display entirely, but
// Electron segfaults with it here.)
//
//   node scripts/ui-check/start.mjs [--visible]    then drive it with cdp.mjs, then run stop.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, evaluate, findTarget, MAIN_PORT, RENDERER_PORT } from './cdp-client.mjs';
import { writeFixturePdf } from './fixture-pdf.mjs';
import { STATE_DIR, readPid } from './state.mjs';

const DESKTOP_DIR = fileURLToPath(new URL('../../packages/desktop', import.meta.url));
const STARTUP_TIMEOUT_MS = 180_000;
const visible = process.argv.includes('--visible');

async function waitFor(check, label) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/**
 * Main-process setup, run as soon as its inspector is up (before the window
 * exists): the "Add PDF" dialog returns the fixture, since CDP cannot drive
 * native dialogs, and, unless visible, every window is hidden the moment it
 * is created or shown. Background throttling is off so a hidden window keeps
 * painting for screenshots.
 */
function mainProcessSetup(fixturePath) {
  return `(() => {
    const { app, BrowserWindow, dialog } = process.mainModule.require('electron');
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [${JSON.stringify(fixturePath)}] });
    const prepare = (win) => {
      win.webContents.setBackgroundThrottling(false);
      if (${visible}) return;
      win.hide();
      win.on('show', () => win.hide());
    };
    BrowserWindow.getAllWindows().forEach(prepare);
    app.on('browser-window-created', (_event, win) => prepare(win));
    return true;
  })()`;
}

/** Resolves once React has rendered the app into #root; throws until then so waitFor retries. */
async function checkAppRendered() {
  const session = await connect(await findTarget('renderer'));
  try {
    const rendered = await evaluate(session, "document.querySelector('#root')?.innerText.trim().length > 0");
    if (!rendered) throw new Error('the window has not rendered the app yet');
  } finally {
    session.close();
  }
}

async function setUpMainProcess(fixturePath) {
  const session = await connect(await findTarget('main'));
  try {
    await evaluate(session, mainProcessSetup(fixturePath));
  } finally {
    session.close();
  }
}

if (readPid() !== null) {
  console.error(`A UI check app is already running (see ${STATE_DIR}). Run stop.mjs first.`);
  process.exit(1);
}
rmSync(STATE_DIR, { recursive: true, force: true });
const profileDir = join(STATE_DIR, 'profile');
mkdirSync(profileDir, { recursive: true });
const fixturePath = join(STATE_DIR, 'fixture.pdf');
writeFixturePdf(fixturePath);

const log = openSync(join(STATE_DIR, 'app.log'), 'a');
const child = spawn(
  'npx',
  ['electron-forge', 'start', '--inspect-electron', '--', `--remote-debugging-port=${RENDERER_PORT}`, `--user-data-dir=${profileDir}`],
  { cwd: DESKTOP_DIR, env: { ...process.env, TB_DISABLE_GPU: '1' }, detached: true, stdio: ['ignore', log, log] },
);
child.unref();
writeFileSync(join(STATE_DIR, 'pid'), String(child.pid));

await waitFor(() => setUpMainProcess(fixturePath), `the main process on port ${MAIN_PORT}`);
await waitFor(checkAppRendered, `the app window on port ${RENDERER_PORT}`);
console.log(`App ready (${visible ? 'visible' : 'hidden'}). Profile: ${profileDir}  Log: ${join(STATE_DIR, 'app.log')}`);
console.log('The library is empty; click "Add PDF" to add the fixture book.');
