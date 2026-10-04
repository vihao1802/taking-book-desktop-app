// Runs checks against the Android app's real WebView on a connected emulator or
// device, through Playwright's Android driver (connectOverCDP does not work
// with a WebView). Install and
// start the debug APK first (npm run android:apk, adb install, adb shell am start).
//
// Usage (from the repo root): node packages/mobile/browser-check/device-run.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _android as android } from 'playwright-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOUCH_TARGETS = readFileSync(resolve(HERE, '../../../scripts/ui-check/touch-targets.js'), 'utf8');
const APP_ID = 'dev.takingbook.app';
const SETTLE_MS = 800;
// Saving the position is debounced, so a read right after a move waits this many settles.
const SETTLE_PAUSES = 2;
const REFLOW_TIMEOUT_MS = 30000;
const READER_OPEN_TIMEOUT_MS = 20000;
const OVERLAY_HIDE_MS = 3500;
const MAX_DEPTH_DRIFT = 0.25;
// Far enough from the end that Page mode, whose three short pages barely scroll on a phone, does not clamp the spot it is handed.
const REFLOW_SCROLL_FRACTION = 0.3;
const PICKER_ATTEMPTS = 15;
const FIXTURE_NAME = 'fixture.pdf';
const COMPACT_MAX_DP = 600;

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const results = [];
const record = (check, ok, detail = '') => results.push({ check, ok, detail });

async function check(name, run) {
  try {
    const detail = await run();
    record(name, detail === undefined || detail === '', String(detail ?? ''));
  } catch (error) {
    record(name, false, String(error.message).split('\n')[0]);
  }
}

const [device] = await android.devices();
if (!device) {
  console.error('No Android device or emulator is connected.');
  process.exit(2);
}
const webView = await device.webView({ pkg: APP_ID }, { timeout: 15000 });
const page = await webView.page();
const errors = [];
const warnings = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (['warning', 'error'].includes(message.type())) warnings.push(message.text());
});

/**
 * Taps with the system's own touch input, so the WebView gets exactly what a
 * finger sends. Playwright's tap is not supported on a WebView page, and the
 * WebView sits below the status bar, so the offset between screen pixels and
 * CSS pixels is measured once with a calibration tap.
 */
async function createNativeTapper() {
  const dpr = await page.evaluate(() => devicePixelRatio);
  await page.evaluate(() => {
    window.__calibration = null;
    addEventListener('pointerdown', (event) => { window.__calibration = { x: event.clientX, y: event.clientY }; }, { once: true, capture: true });
  });
  const probe = { x: 300, y: 900 };
  adb('shell', 'input', 'tap', String(probe.x), String(probe.y));
  await page.waitForFunction(() => window.__calibration !== null);
  const seen = await page.evaluate(() => window.__calibration);
  const offset = { x: probe.x - seen.x * dpr, y: probe.y - seen.y * dpr };
  const toScreen = (cssX, cssY) => [String(Math.round(cssX * dpr + offset.x)), String(Math.round(cssY * dpr + offset.y))];
  return {
    async tapElement(selector) {
      const box = await page.evaluate((sel) => {
        const r = document.querySelector(sel)?.getBoundingClientRect();
        return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      }, selector);
      if (!box) throw new Error(`${selector} is not on the page`);
      adb('shell', 'input', 'tap', ...toScreen(box.x, box.y));
    },
  };
}

const tapper = await createNativeTapper();

/** Reads the visible Android UI (outside the WebView) as labelled rows with their centre, by text or content description. */
function readNativeScreen() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
  const xml = adb('shell', 'cat', '/sdcard/ui.xml');
  return [...xml.matchAll(/<node [^>]*>/g)].flatMap(([node]) => {
    const label = /text="([^"]+)"/.exec(node)?.[1] ?? /content-desc="([^"]+)"/.exec(node)?.[1];
    const bounds = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (!label || !bounds) return [];
    const [left, top, right, bottom] = bounds.slice(1).map(Number);
    return [{ text: label, x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) }];
  });
}

const tapNative = (row) => adb('shell', 'input', 'tap', String(row.x), String(row.y));

/**
 * Walks the system document picker to the fixture and confirms it. The picker
 * opens on Recent, so the roots menu is opened to reach Downloads, where the
 * fixture was pushed.
 */
async function pickFixtureInSystemPicker() {
  for (let attempt = 0; attempt < PICKER_ATTEMPTS; attempt++) {
    await page.waitForTimeout(SETTLE_MS);
    const rows = readNativeScreen();
    const fixture = rows.find((row) => row.text === FIXTURE_NAME);
    if (fixture) {
      tapNative(fixture);
      await page.waitForTimeout(SETTLE_MS);
      const confirm = readNativeScreen().find((row) => /^(Select|Open)$/i.test(row.text));
      if (confirm) tapNative(confirm);
      return;
    }
    const next = rows.find((row) => row.text === 'Downloads') ?? rows.find((row) => /^Show roots$/i.test(row.text));
    if (next) tapNative(next);
  }
  throw new Error('The system picker never showed the fixture');
}

const tapText = async (selector, text) => {
  await page.evaluate(([sel, wanted]) => {
    document.querySelectorAll('[data-device-tap]').forEach((el) => el.removeAttribute('data-device-tap'));
    [...document.querySelectorAll(sel)].find((el) => el.textContent?.includes(wanted))?.setAttribute('data-device-tap', '');
  }, [selector, text]);
  await tapper.tapElement('[data-device-tap]');
};
const width = await page.evaluate(() => innerWidth);
console.log(`WebView ${width}dp wide (${width < COMPACT_MAX_DP ? 'compact' : 'medium or larger'}), ${await page.evaluate(() => navigator.userAgent.match(/Chrome\/[\d.]+/)[0])}`);

const savedState = () =>
  page.evaluate(async () => {
    const files = (await window.api.listFiles()).data;
    const id = files[0].id;
    return {
      position: (await window.api.getLastPosition(id)).data,
      pageZoom: (await window.api.getFileZoom(id, 'page')).data,
      reflowZoom: (await window.api.getFileZoom(id, 'reflow')).data,
    };
  });

async function showOverlay() {
  await tapper.tapElement('[data-reader-view]');
  await page.waitForTimeout(SETTLE_MS);
}

async function setMode(mode) {
  await showOverlay();
  const pressed = (await page.getAttribute('button[aria-label="Toggle reflow"]', 'aria-pressed')) === 'true';
  if (pressed !== (mode === 'reflow')) await tapper.tapElement('button[aria-label="Toggle reflow"]');
  if (mode === 'reflow') await page.waitForSelector('[data-reflow-page]', { timeout: REFLOW_TIMEOUT_MS });
  else await page.waitForSelector('canvas', { timeout: READER_OPEN_TIMEOUT_MS });
  await page.waitForTimeout(OVERLAY_HIDE_MS);
}

async function openFixtureBook() {
  // Adding a Book opens it, so it may already be on screen.
  if (await page.$('[data-reader-view]')) return;
  await tapper.tapElement('nav button[aria-label=Library]');
  await page.waitForTimeout(SETTLE_MS);
  await tapper.tapElement('[aria-label^="Details for"]');
  await page.waitForSelector('[data-slot=sheet-content] [aria-label^="Open"], aside [aria-label^="Open"]');
  await tapper.tapElement('[data-slot=sheet-content] [aria-label^="Open"], aside [aria-label^="Open"]');
  await page.waitForSelector('[data-reader-view]', { timeout: READER_OPEN_TIMEOUT_MS });
  await page.waitForTimeout(OVERLAY_HIDE_MS);
}

/** Reflow on the real WebView, with the Book added through the system file picker and kept in the real SQLite. */
async function checkReflowOnDevice() {
  await check('Reflow: the fixture is added through the system picker and opens', async () => {
    await tapper.tapElement('nav button[aria-label=Home]');
    await page.waitForTimeout(SETTLE_MS);
    await tapText('button', 'Add PDF');
    await pickFixtureInSystemPicker();
    await page.waitForFunction(() => window.api.listFiles().then((r) => r.data.length > 0), null, { timeout: READER_OPEN_TIMEOUT_MS });
    await openFixtureBook();
  });
  await check('Reflow: text and a figure show in the WebView', async () => {
    await setMode('reflow');
    await page.waitForSelector('[data-reflow-page]', { timeout: REFLOW_TIMEOUT_MS });
    // A figure is only fetched once it is near the screen, so bring its holder into view first.
    await page.evaluate(() => document.querySelector('[data-reflow-page] .my-6')?.scrollIntoView());
    const figureShown = await page
      .waitForSelector('[data-reflow-page] img', { state: 'attached', timeout: REFLOW_TIMEOUT_MS })
      .then(() => true, () => false);
    if (!figureShown) {
      const holders = await page.evaluate(() => document.querySelectorAll('[data-reflow-page] .my-6').length);
      return `no figure image; ${holders} figure holders; console: ${warnings.slice(-3).join(' | ')}`;
    }
    await page.evaluate(() => document.querySelector('[data-reflow-page] img').scrollIntoView());
    await page.waitForFunction(() => document.querySelector('[data-reflow-page] img')?.naturalWidth > 0, null, { timeout: REFLOW_TIMEOUT_MS });
    const text = await page.evaluate(() => document.querySelector('[data-reflow-page]').textContent);
    return text.includes('query optimizer') ? '' : 'the reflow text is missing';
  });
  await check('Reflow: switching modes keeps the page and depth, both ways', async () => {
    await page.evaluate((fraction) => {
      const el = document.querySelector('[data-reader-view]');
      el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction;
    }, REFLOW_SCROLL_FRACTION);
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    const inReflow = (await savedState()).position;
    await setMode('page');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    const inPage = (await savedState()).position;
    await setMode('reflow');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    const back = (await savedState()).position;
    if (inReflow.page !== inPage.page || inPage.page !== back.page) return `page ${inReflow.page} -> ${inPage.page} -> ${back.page}`;
    return Math.abs(inReflow.position - back.position) < MAX_DEPTH_DRIFT ? '' : `depth ${inReflow.position} -> ${back.position}`;
  });
  await check('Reflow: the Last-read position records the mode it was left in', async () => {
    const reflow = (await savedState()).position.mode;
    await setMode('page');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    const pageMode = (await savedState()).position.mode;
    await setMode('reflow');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    return reflow === 'reflow' && pageMode === 'page' ? '' : `saved ${reflow}, then ${pageMode}`;
  });
  await check('Reflow: each mode keeps its own zoom', async () => {
    await showOverlay();
    await tapper.tapElement('button[aria-label="Zoom in"]');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    const afterReflowZoom = await savedState();
    await setMode('page');
    await showOverlay();
    await tapper.tapElement('button[aria-label="Zoom in"]');
    await tapper.tapElement('button[aria-label="Zoom in"]');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    const afterPageZoom = await savedState();
    const reflowKept = afterPageZoom.reflowZoom === afterReflowZoom.reflowZoom;
    const separate = afterPageZoom.pageZoom !== afterPageZoom.reflowZoom;
    return afterReflowZoom.reflowZoom > 1 && reflowKept && separate ? '' : JSON.stringify({ afterReflowZoom, afterPageZoom });
  });
  await check('Reflow: the Book reopens in the mode it was left in', async () => {
    await setMode('reflow');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await page.waitForTimeout(SETTLE_MS * SETTLE_PAUSES);
    await openFixtureBook();
    await page.waitForSelector('[data-reflow-page]', { timeout: REFLOW_TIMEOUT_MS });
  });
}

for (const view of ['Home', 'Library', 'Favorites', 'Notes', 'Settings']) {
  await check(`${view}: opens with a real touch`, async () => {
    await tapper.tapElement(`nav button[aria-label=${view}]`);
    await page.waitForTimeout(SETTLE_MS);
    const current = await page.evaluate(() => document.querySelector('nav [aria-current=page]')?.getAttribute('aria-label'));
    return current === view ? '' : `current is ${current}`;
  });
  if (width < COMPACT_MAX_DP) {
    await check(`${view}: every control is at least 48dp`, async () => {
      const small = JSON.parse(await page.evaluate(TOUCH_TARGETS));
      return small.length === 0 ? '' : small.join(', ');
    });
  }
}
await checkReflowOnDevice();
if (errors.length > 0) record('No uncaught page errors', false, errors[0]);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.ok ? '' : `  -> ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await device.close();
process.exit(failed === 0 ? 0 : 1);
