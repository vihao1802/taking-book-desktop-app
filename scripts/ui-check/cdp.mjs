// Drives the running app for a UI check. Start it first with start.mjs.
//
//   node scripts/ui-check/cdp.mjs eval '<js>'        run JS in the window, print the JSON result
//   node scripts/ui-check/cdp.mjs main '<js>'        run JS in the Electron main process
//   node scripts/ui-check/cdp.mjs shot <out.png>     screenshot the window
//   node scripts/ui-check/cdp.mjs click <x,y>        real mouse click at viewport coordinates
//   node scripts/ui-check/cdp.mjs dbl <x,y>          real double-click (selects a word)
//   node scripts/ui-check/cdp.mjs drag <x1,y1> <x2,y2>  press, move, release (selects a range)
//   node scripts/ui-check/cdp.mjs key <Key>          press a key, e.g. Escape, Enter, ArrowDown
//   node scripts/ui-check/cdp.mjs center '<css>'     print "x,y" of an element's center, for click
import { writeFileSync } from 'node:fs';
import { connect, evaluate, findTarget } from './cdp-client.mjs';

// Windows virtual key codes; Chromium needs them for keys to reach keydown handlers.
const KEY_CODES = { Escape: 27, Enter: 13, Tab: 9, Space: 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

function parsePoint(text) {
  const [x, y] = text.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Expected "x,y", got "${text}"`);
  return { x, y };
}

async function mouse(session, type, { x, y }, clickCount = 1) {
  await session.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount });
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
  async key(session, [key]) {
    const code = KEY_CODES[key] ?? key.toUpperCase().charCodeAt(0);
    for (const type of ['keyDown', 'keyUp']) {
      await session.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code });
    }
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
