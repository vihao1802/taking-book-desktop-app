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
page.on('pageerror', (error) => errors.push(error.message));

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
const width = await page.evaluate(() => innerWidth);
console.log(`WebView ${width}dp wide (${width < COMPACT_MAX_DP ? 'compact' : 'medium or larger'}), ${await page.evaluate(() => navigator.userAgent.match(/Chrome\/[\d.]+/)[0])}`);

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
if (errors.length > 0) record('No uncaught page errors', false, errors[0]);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.check}${r.ok ? '' : `  -> ${r.detail}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
await device.close();
process.exit(failed === 0 ? 0 : 1);
