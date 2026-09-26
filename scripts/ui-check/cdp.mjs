// Drives the running app for a UI check. Start it first with start.mjs.
//
//   node scripts/ui-check/cdp.mjs eval '<js>'        run JS in the window, print the JSON result
//   node scripts/ui-check/cdp.mjs main '<js>'        run JS in the Electron main process
//   node scripts/ui-check/cdp.mjs shot <out.png>     screenshot the window
//   node scripts/ui-check/cdp.mjs click <x,y>        real mouse click at viewport coordinates
//   node scripts/ui-check/cdp.mjs dbl <x,y>          real double-click (selects a word)
//   node scripts/ui-check/cdp.mjs drag <x1,y1> <x2,y2>  press, move, release (selects a range)
//   node scripts/ui-check/cdp.mjs drop <x,y> <path...>  drop files/folders from the OS at viewport coordinates
//   node scripts/ui-check/cdp.mjs hover-files <x,y[;x,y...]> <path...>  drag files over the window without dropping
//   node scripts/ui-check/cdp.mjs drag-out           move a hover-files drag back out of the window, dropping nothing
//   node scripts/ui-check/cdp.mjs key <Key>          press a key, e.g. Escape, Enter, ArrowDown, Shift+ArrowRight
//   node scripts/ui-check/cdp.mjs center '<css>'     print "x,y" of an element's center, for click
//   node scripts/ui-check/cdp.mjs word '<text>'      print "x,y" of the first on-screen occurrence of text, for dbl/drag
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect, evaluate, findTarget } from './cdp-client.mjs';

// Windows virtual key codes; Chromium needs them for keys to reach keydown handlers.
const KEY_CODES = { Escape: 27, Enter: 13, Tab: 9, Space: 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
// CDP's modifier bit flags, for combinations such as Shift+ArrowRight.
const MODIFIER_FLAGS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
// CDP's drag operation bit for "copy", what a file manager offers for a file drag.
const DRAG_OPERATION_COPY = 1;

function parseKeyCombination(text) {
  const parts = text.split('+');
  const key = parts.pop();
  let modifiers = 0;
  for (const name of parts) {
    if (!(name in MODIFIER_FLAGS)) throw new Error(`Unknown modifier "${name}" in "${text}"`);
    modifiers |= MODIFIER_FLAGS[name];
  }
  return { key, modifiers };
}

function parsePoint(text) {
  const [x, y] = text.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Expected "x,y", got "${text}"`);
  return { x, y };
}

async function mouse(session, type, { x, y }, clickCount = 1) {
  await session.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount });
}

/** Drag data carrying files from the OS, as a file manager supplies it. */
function fileDragData(paths) {
  if (paths.length === 0) throw new Error('Needs at least one file or folder path');
  const files = paths.map((path) => resolve(path));
  // A mistyped path would drag nothing and read as "the page ignored it".
  const missing = files.filter((file) => !existsSync(file));
  if (missing.length > 0) throw new Error(`No such file or folder: ${missing.join(', ')}`);
  return { items: [], files, dragOperationsMask: DRAG_OPERATION_COPY };
}

const commands = {
  async eval(session, [expression]) {
    console.log(JSON.stringify(await evaluate(session, expression), null, 1));
  },
  async main(session, [expression]) {
    console.log(JSON.stringify(await evaluate(session, expression), null, 1));
  },
  async shot(session, [path]) {
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));
    console.log(`saved ${path}`);
  },
  async click(session, [point]) {
    const at = parsePoint(point);
    await mouse(session, 'mousePressed', at);
    await mouse(session, 'mouseReleased', at);
  },
  async dbl(session, [point]) {
    const at = parsePoint(point);
    for (const count of [1, 2]) {
      await mouse(session, 'mousePressed', at, count);
      await mouse(session, 'mouseReleased', at, count);
    }
  },
  async drag(session, [from, to]) {
    const start = parsePoint(from);
    const end = parsePoint(to);
    await mouse(session, 'mousePressed', start);
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 });
    await mouse(session, 'mouseReleased', end);
  },
  // Simulates an OS file drop: Chromium receives the absolute paths as it
  // would from a file manager, so the page's drag handlers and Electron's
  // navigate-on-drop default both run for real.
  async drop(session, [point, ...paths]) {
    const at = parsePoint(point);
    const data = fileDragData(paths);
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await session.send('Input.dispatchDragEvent', { type, ...at, data });
    }
  },
  // Holds files over the window, moving across each point in turn, and leaves
  // the drag in progress so a screenshot can catch what the page shows mid-drag.
  async 'hover-files'(session, [pointList, ...paths]) {
    const points = pointList.split(';').map(parsePoint);
    const data = fileDragData(paths);
    await session.send('Input.dispatchDragEvent', { type: 'dragEnter', ...points[0], data });
    for (const at of points) await session.send('Input.dispatchDragEvent', { type: 'dragOver', ...at, data });
  },
  // Moves the drag past the window's top-left corner, as a reader dragging
  // the files back out would; Chromium then fires dragleave for real.
  // (dragCancel does not: it leaves the page believing the drag is still over it.)
  async 'drag-out'(session) {
    const data = { items: [], files: [], dragOperationsMask: DRAG_OPERATION_COPY };
    await session.send('Input.dispatchDragEvent', { type: 'dragOver', x: -50, y: -50, data });
  },
  async key(session, [combination]) {
    const { key, modifiers } = parseKeyCombination(combination);
    const code = KEY_CODES[key] ?? key.toUpperCase().charCodeAt(0);
    for (const type of ['keyDown', 'keyUp']) {
      await session.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code, modifiers });
    }
  },
  // Walks text nodes rather than elements because page mode's text layer and
  // reflow's paragraphs split words across spans differently, and pixel
  // positions read off a screenshot go stale as pages lay out.
  async word(session, [text]) {
    const point = await evaluate(
      session,
      `(() => {
        const text = ${JSON.stringify(text)};
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = node.data.indexOf(text);
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + text.length);
          const r = range.getBoundingClientRect();
          if (r.width === 0 || r.top < 0 || r.bottom > innerHeight) continue;
          return Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2);
        }
        return null;
      })()`,
    );
    if (point === null) throw new Error(`No on-screen text matches ${JSON.stringify(text)}`);
    console.log(point);
  },
  async center(session, [selector]) {
    const point = await evaluate(
      session,
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
        const r = el.getBoundingClientRect(); return Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2); })()`,
    );
    if (point === null) throw new Error(`No element matches ${selector}`);
    console.log(point);
  },
};

const [name, ...args] = process.argv.slice(2);
const command = commands[name];
if (!command) {
  console.error(`Unknown command "${name}". Commands: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}
const session = await connect(await findTarget(name === 'main' ? 'main' : 'renderer'));
try {
  await command(session, args);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  session.close();
}
