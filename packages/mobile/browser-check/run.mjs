// Drives the shared renderer in headless Chrome with a phone's touch input and
// each Window size class's viewport, against a fake reader API (see
// harness-reader-api.ts). It checks layout and touch behaviour only; the
// WebView, the Capacitor plugins and the keyboard are not here.
//
// Usage (from the repo root): npm run browser-check --workspace @taking-book/mobile
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { writeFixturePdf } from '../../../scripts/ui-check/fixture-pdf.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOUCH_TARGETS = readFileSync(resolve(HERE, '../../../scripts/ui-check/touch-targets.js'), 'utf8');
const SETTLE_MS = 600;
const OVERLAY_HIDE_MS = 3200;
const CLASSES = [
  { name: 'compact', width: 390, height: 844 },
  { name: 'medium', width: 700, height: 900 },
  { name: 'expanded', width: 1100, height: 800 },
];

const results = [];
function record(sizeClass, check, ok, detail = '') {
  results.push({ sizeClass, check, ok, detail });
}

/** Runs one check; an exception is a failed check, not the end of the run. */
async function check(sizeClass, name, run) {
  try {
    const detail = await run();
    if (detail === true || detail === undefined) record(sizeClass, name, true);
    else record(sizeClass, name, detail === '' ? true : false, String(detail));
  } catch (error) {
    record(sizeClass, name, false, String(error.message).split('\n').slice(0, 14).join(" | ").slice(0, 1500));
  }
}

const rectOf = (page, selector) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null;
  }, selector);

const overlayOpacity = (page) =>
  page.evaluate(() => getComputedStyle(document.querySelector('.overlay-top')).opacity);

const tap = (page, selector) => page.locator(selector).first().tap({ timeout: 5000 });

/** Empty when the surface sits against the bottom edge across the whole width, as a bottom sheet does. */
async function expectBottomSheet(page, selector) {
  const r = await rectOf(page, selector);
  if (!r) return `${selector} is not on screen`;
  const { vw, vh } = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight }));
  return Math.abs(r.bottom - vh) < 2 && Math.abs(r.width - vw) < 2 ? '' : `not a bottom sheet: ${JSON.stringify(r)}`;
}

/** Empty when the surface floats clear of the bottom edge and is centred, as a dialog does. */
async function expectCentred(page, selector) {
  const r = await rectOf(page, selector);
  if (!r) return `${selector} is not on screen`;
  const { vw, vh } = await page.evaluate(() => ({ vw: innerWidth, vh: innerHeight }));
  const centred = Math.abs((r.left + r.right) / 2 - vw / 2) < 2 && r.bottom < vh - 2;
  return centred ? '' : `not centred: ${JSON.stringify(r)}`;
}

/** A finger dragging up the screen, sent as raw touch events so the page scrolls as it would under a thumb. */
async function swipeUp(session, x, y) {
  const STEPS = 12;
  const STEP_PX = 30;
  const send = (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
  await send('touchStart', [{ x, y }]);
  for (let i = 1; i <= STEPS; i++) {
    await send('touchMove', [{ x, y: y - i * STEP_PX }]);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await send('touchEnd', []);
}

async function checkLibrary(page, sizeClass) {
  await tap(page, 'button[aria-label=Library]');
  await page.waitForTimeout(SETTLE_MS);
  if (sizeClass.name === 'compact') {
    await check(sizeClass.name, 'Library: every control is at least 48dp', async () => {
      const small = JSON.parse(await page.evaluate(TOUCH_TARGETS));
      return small.length === 0 ? '' : small.join(', ');
    });
  }
  await check(sizeClass.name, 'Book details open as a bottom sheet from the grid', async () => {
    await tap(page, '[aria-label^="Details for"]');
    await page.waitForSelector('[data-slot=sheet-content]');
    await page.waitForTimeout(SETTLE_MS);
    return expectBottomSheet(page, '[data-slot=sheet-content]');
  });
  if (sizeClass.name === 'compact') {
    await check(sizeClass.name, 'Book details: every control is at least 48dp', async () => {
      const small = JSON.parse(await page.evaluate(TOUCH_TARGETS));
      return small.length === 0 ? '' : small.join(', ');
    });
  }
  await check(sizeClass.name, 'A select is a bottom sheet at compact and anchored otherwise', async () => {
    await tap(page, '[data-slot=sheet-content] [role=combobox]');
    await page.waitForSelector('[data-slot=select-content]');
    await page.waitForTimeout(SETTLE_MS);
    const wrapper = '[data-radix-popper-content-wrapper]';
    if (sizeClass.name === 'compact') return expectBottomSheet(page, wrapper);
    const r = await rectOf(page, wrapper);
    const { vw } = await page.evaluate(() => ({ vw: innerWidth }));
    return r && r.width < vw - 2 ? '' : `select spans the window: ${JSON.stringify(r)}`;
  });
  await page.keyboard.press('Escape');
  await check(sizeClass.name, 'A dialog is a bottom sheet at compact and centred otherwise', async () => {
    await tap(page, '[data-slot=sheet-content] [aria-label$="from library"]');
    await page.waitForSelector('[role=dialog]');
    await page.waitForTimeout(SETTLE_MS);
    const result = sizeClass.name === 'compact' ? await expectBottomSheet(page, '[role=dialog]') : await expectCentred(page, '[role=dialog]');
    await tap(page, '[role=dialog] button:has-text("Cancel")');
    await page.waitForTimeout(SETTLE_MS);
    return result;
  });
  if (sizeClass.name === 'expanded') {
    await check(sizeClass.name, 'Book details sit in a pane beside the List view', async () => {
      await tap(page, '[aria-label="List view"]');
      await tap(page, '[aria-label^="Details for"]');
      await page.waitForSelector('aside section[aria-label="Book details"]');
      const sheet = await page.$('[data-slot=sheet-content]');
      return sheet ? 'a sheet is open too' : '';
    });
    await tap(page, '[aria-label="Close details"]');
  }
}

async function openBook(page) {
  await tap(page, '[aria-label^="Details for"]');
  await tap(page, '[data-slot=sheet-content] [aria-label^="Open"], aside [aria-label^="Open"]');
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(OVERLAY_HIDE_MS);
}

async function checkReaderTaps(page, session, sizeClass) {
  const { width, height } = sizeClass;
  await check(sizeClass.name, 'Reader: the overlay starts hidden', async () => ((await overlayOpacity(page)) === '0' ? '' : 'overlay is showing'));
  for (const [fx, fy] of [[0.1, 0.5], [0.5, 0.5], [0.9, 0.9]]) {
    await check(sizeClass.name, `Reader: a tap at ${fx * 100}%,${fy * 100}% shows then hides the overlay`, async () => {
      await page.touchscreen.tap(width * fx, height * fy);
      await page.waitForTimeout(SETTLE_MS);
      const shown = await overlayOpacity(page);
      await page.touchscreen.tap(width * fx, height * fy);
      await page.waitForTimeout(SETTLE_MS);
      const hidden = await overlayOpacity(page);
      const target = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return el ? `${el.tagName}.${String(el.className).slice(0, 40)}` : 'nothing';
        },
        [width * fx, height * fy],
      );
      return shown === '1' && hidden === '0' ? '' : `after taps: ${shown}, ${hidden}; element at point: ${target}`;
    });
  }
  await check(sizeClass.name, 'Reader: a swipe scrolls the page and does not toggle the overlay', async () => {
    const top = (p) => p.evaluate(() => document.querySelector('[data-reader-view]').scrollTop);
    const before = await top(page);
    await swipeUp(session, width / 2, height * 0.7);
    await page.waitForTimeout(SETTLE_MS);
    const after = await top(page);
    const opacity = await overlayOpacity(page);
    return after > before && opacity === '0' ? '' : `scrollTop ${before} -> ${after}, overlay ${opacity}`;
  });
}

async function showOverlay(page, sizeClass) {
  await page.touchscreen.tap(sizeClass.width / 2, sizeClass.height / 2);
  await page.waitForTimeout(SETTLE_MS);
}

async function checkReaderPanels(page, sizeClass) {
  await showOverlay(page, sizeClass);
  if (sizeClass.name === 'compact') {
    await check(sizeClass.name, 'Reader: every control is at least 48dp with the overlay showing', async () => {
      const small = JSON.parse(await page.evaluate(TOUCH_TARGETS));
      return small.length === 0 ? '' : small.join(', ');
    });
  }
  await check(sizeClass.name, 'Notes sidebar: a sheet below expanded, a pushing panel at expanded', async () => {
    const full = await rectOf(page, '[data-reader-view]');
    await tap(page, 'button[aria-label=Notes]');
    await page.waitForSelector('aside[aria-label=Notes]');
    await page.waitForTimeout(SETTLE_MS);
    const after = await rectOf(page, '[data-reader-view]');
    const result =
      sizeClass.name === 'expanded'
        ? after.width < full.width - 100
          ? ''
          : `page did not narrow: ${full.width} -> ${after.width}`
        : (await expectBottomSheet(page, 'aside[aria-label=Notes]')) || (after.width === full.width ? '' : 'page narrowed under a sheet');
    await tap(page, '[aria-label="Close notes"]');
    await page.waitForTimeout(SETTLE_MS);
    return result;
  });
  await check(sizeClass.name, 'Reader sidebar: floating, at most 85% of the width at compact', async () => {
    await showOverlay(page, sizeClass);
    await tap(page, '[aria-label="Thumbnails and outlines"]');
    const menu = sizeClass.name === 'compact' ? await expectBottomSheet(page, '[role=menu]') : '';
    await tap(page, '[role=menuitem]:has-text("Thumbnails")');
    await page.waitForSelector('aside[aria-label=Thumbnails]');
    const r = await rectOf(page, 'aside[aria-label=Thumbnails]');
    const limit = sizeClass.name === 'compact' ? sizeClass.width * 0.85 + 1 : Infinity;
    await tap(page, '[aria-label="Close sidebar"]');
    await page.waitForTimeout(SETTLE_MS);
    return menu || (r.width <= limit ? '' : `sidebar is ${r.width} wide`);
  });
  await check(sizeClass.name, 'Go to page bar stays inside the window', async () => {
    await showOverlay(page, sizeClass);
    await tap(page, '[aria-label="Go to page"]');
    await page.waitForSelector('[role=dialog][aria-label="Go to page"]');
    const r = await rectOf(page, '[role=dialog][aria-label="Go to page"]');
    await page.keyboard.press('Escape');
    return r.left >= 0 && r.right <= sizeClass.width ? '' : `bar spans ${r.left}..${r.right}`;
  });
}

async function checkResize(page, sizeClass) {
  await check(sizeClass.name, 'Reader: rotating keeps the place in the book', async () => {
    await page.evaluate(() => {
      const view = document.querySelector('[data-reader-view]');
      view.scrollTop = (view.scrollHeight - view.clientHeight) * 0.5;
    });
    await page.waitForTimeout(SETTLE_MS);
    const fraction = () =>
      page.evaluate(() => {
        const view = document.querySelector('[data-reader-view]');
        return view.scrollTop / (view.scrollHeight - view.clientHeight);
      });
    const before = await fraction();
    await page.setViewportSize({ width: sizeClass.height, height: sizeClass.width });
    await page.waitForTimeout(1000);
    await page.setViewportSize({ width: sizeClass.width, height: sizeClass.height });
    await page.waitForTimeout(1000);
    const after = await fraction();
    return Math.abs(after - before) < 0.05 ? '' : `place moved from ${before.toFixed(2)} to ${after.toFixed(2)}`;
  });
}

async function runClass(browser, baseUrl, sizeClass) {
  const context = await browser.newContext({
    viewport: { width: sizeClass.width, height: sizeClass.height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseUrl}/harness.html`);
  await page.waitForSelector('button[aria-label=Library]', { timeout: 15000 });
  const session = await context.newCDPSession(page);
  await checkLibrary(page, sizeClass);
  await check(sizeClass.name, 'The book opens', async () => {
    await openBook(page);
    return '';
  });
  await checkReaderTaps(page, session, sizeClass);
  await checkReaderPanels(page, sizeClass);
  await checkResize(page, sizeClass);
  if (errors.length > 0) record(sizeClass.name, 'No uncaught page errors', false, errors[0]);
  await context.close();
}

function printResults() {
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.sizeClass.padEnd(8)} ${r.check}${r.ok ? '' : `  -> ${r.detail}`}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  return failed;
}

const fixtureDir = join(tmpdir(), 'tb-browser-check');
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = join(fixtureDir, 'fixture.pdf');
writeFixturePdf(fixturePath);
const fixtureBytes = readFileSync(fixturePath);

const server = await createServer({
  root: resolve(HERE, '..'),
  logLevel: 'error',
  server: { port: 0, host: '127.0.0.1' },
  plugins: [
    {
      name: 'fixture-pdf',
      configureServer(devServer) {
        devServer.middlewares.use('/fixture.pdf', (_request, response) => {
          response.setHeader('Content-Type', 'application/pdf');
          response.end(fixtureBytes);
        });
      },
    },
  ],
});
await server.listen();
const baseUrl = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const only = process.env.ONLY_CLASS;
  for (const sizeClass of CLASSES.filter((c) => !only || c.name === only)) await runClass(browser, baseUrl, sizeClass);
} finally {
  await browser.close();
  await server.close();
}
process.exit(printResults() === 0 ? 0 : 1);
