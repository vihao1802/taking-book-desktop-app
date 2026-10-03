// PROTOTYPE, THROWAWAY. Our own touch selection over the pdf.js text layer, used instead of the WebView's native
// selection. Why: dragging a native handle into empty space (for example right of a short last line) makes the
// WebView snap the selection end to the end of the whole text layer, because the spans are absolutely positioned.
// Here the caret under a finger is computed from span geometry (nearest line by y, then nearest span by x, then a
// binary search over characters), so it does not depend on how the WebView hit-tests.

export interface CustomSelection {
  /** The selected range, or null when nothing is selected. */
  getRange(): Range | null;
  clear(): void;
  /** True for a short while after a tap cleared a selection, so that tap is not also read as "toggle the chrome". */
  justCleared(): boolean;
}

interface Caret {
  node: Text;
  offset: number;
}

const WORD_CHARACTER = /[\p{L}\p{N}_'’-]/u;
const LONG_PRESS_MS = 480;
const MOVE_SLOP_PX = 10;
const HANDLE_SIZE = 30;
const HANDLE_GAP = 14; // handle centre sits this far below the line, so a finger does not cover the text

function leafTextNodes(nearY: number): Text[] {
  const nodes: Text[] = [];
  for (const page of document.querySelectorAll<HTMLElement>('.page')) {
    const box = page.getBoundingClientRect();
    if (box.bottom < nearY - 200 || box.top > nearY + 200) continue;
    for (const span of page.querySelectorAll<HTMLElement>('.textLayer span')) {
      const text = span.firstChild;
      if (text instanceof Text && text.length > 0 && !span.querySelector('span')) nodes.push(text);
    }
  }
  return nodes;
}

function offsetAt(text: Text, x: number): number {
  const range = document.createRange();
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    range.setStart(text, mid);
    range.setEnd(text, mid + 1);
    const box = range.getBoundingClientRect();
    if (x < (box.left + box.right) / 2) high = mid;
    else low = mid + 1;
  }
  return low;
}

function caretFromPoint(x: number, y: number): Caret | null {
  let best: { node: Text; dy: number; dx: number } | null = null;
  for (const node of leafTextNodes(y)) {
    const box = (node.parentElement as HTMLElement).getBoundingClientRect();
    if (box.width === 0) continue;
    const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
    const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0;
    if (best === null || dy < best.dy - 0.5 || (Math.abs(dy - best.dy) <= 0.5 && dx < best.dx)) best = { node, dy, dx };
  }
  return best === null ? null : { node: best.node, offset: offsetAt(best.node, x) };
}

function caretBox(caret: Caret): { x: number; top: number; bottom: number } {
  const range = document.createRange();
  if (caret.offset < caret.node.length) {
    range.setStart(caret.node, caret.offset);
    range.setEnd(caret.node, caret.offset + 1);
    const box = range.getBoundingClientRect();
    return { x: box.left, top: box.top, bottom: box.bottom };
  }
  range.setStart(caret.node, Math.max(0, caret.offset - 1));
  range.setEnd(caret.node, caret.offset);
  const box = range.getBoundingClientRect();
  return { x: box.right, top: box.top, bottom: box.bottom };
}

function comesBefore(a: Caret, b: Caret): boolean {
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(a.node, a.offset);
  return range.comparePoint(b.node, b.offset) >= 0;
}

export function installCustomSelection(options: { scroller: HTMLElement; onChange: () => void }): CustomSelection {
  const { scroller, onChange } = options;
  let range: Range | null = null;
  let clearedAt = -Infinity;

  const layer = document.createElement('div');
  layer.className = 'sel-layer';
  const handles = (['start', 'end'] as const).map((which) => {
    const handle = document.createElement('div');
    handle.className = `sel-handle sel-${which}`;
    handle.hidden = true;
    layer.append(handle);
    return handle;
  });
  document.body.append(layer);
  const [startHandle, endHandle] = handles;

  function ends(): { start: Caret; end: Caret } | null {
    if (range === null) return null;
    const { startContainer, startOffset, endContainer, endOffset } = range;
    if (!(startContainer instanceof Text) || !(endContainer instanceof Text)) return null;
    return { start: { node: startContainer, offset: startOffset }, end: { node: endContainer, offset: endOffset } };
  }

  function render(): void {
    for (const old of layer.querySelectorAll('.sel-rect')) old.remove();
    const both = ends();
    if (range === null || both === null) {
      for (const handle of handles) handle.hidden = true;
      return;
    }
    for (const box of range.getClientRects()) {
      if (box.width < 1) continue;
      const mark = document.createElement('div');
      mark.className = 'sel-rect';
      mark.style.cssText = `left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px`;
      layer.insertBefore(mark, startHandle);
    }
    const startBox = caretBox(both.start);
    const endBox = caretBox(both.end);
    startHandle.hidden = endHandle.hidden = false;
    startHandle.style.cssText = `left:${startBox.x - HANDLE_SIZE / 2}px;top:${startBox.bottom + HANDLE_GAP - HANDLE_SIZE / 2}px`;
    endHandle.style.cssText = `left:${endBox.x - HANDLE_SIZE / 2}px;top:${endBox.bottom + HANDLE_GAP - HANDLE_SIZE / 2}px`;
  }

  function set(from: Caret, to: Caret): void {
    const next = document.createRange();
    const [first, second] = comesBefore(from, to) ? [from, to] : [to, from];
    next.setStart(first.node, first.offset);
    next.setEnd(second.node, second.offset);
    range = next;
    render();
    onChange();
  }

  function clear(): void {
    if (range === null) return;
    range = null;
    clearedAt = performance.now();
    render();
    onChange();
  }

  function selectWordAt(x: number, y: number): void {
    const caret = caretFromPoint(x, y);
    if (caret === null) return;
    const { node } = caret;
    const text = node.data;
    let index = Math.min(caret.offset, text.length - 1);
    if (!WORD_CHARACTER.test(text[index] ?? '') && index > 0 && WORD_CHARACTER.test(text[index - 1])) index -= 1;
    if (!WORD_CHARACTER.test(text[index] ?? '')) return;
    let start = index;
    let end = index + 1;
    while (start > 0 && WORD_CHARACTER.test(text[start - 1])) start -= 1;
    while (end < text.length && WORD_CHARACTER.test(text[end])) end += 1;
    set({ node, offset: start }, { node, offset: end });
  }

  // Long press on the text layer selects a word; any other press clears the selection.
  let press: { x: number; y: number; timer: number } | null = null;
  const cancelPress = (): void => {
    if (press !== null) clearTimeout(press.timer);
    press = null;
  };
  scroller.addEventListener('pointerdown', (event) => {
    cancelPress();
    if (range !== null) clear();
    const { clientX: x, clientY: y } = event;
    press = { x, y, timer: window.setTimeout(() => { press = null; selectWordAt(x, y); }, LONG_PRESS_MS) };
  });
  scroller.addEventListener('pointermove', (event) => {
    if (press !== null && Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_SLOP_PX) cancelPress();
  });
  for (const type of ['pointerup', 'pointercancel'] as const) scroller.addEventListener(type, cancelPress);

  // Dragging a handle: the other end stays fixed, the dragged end follows the caret computed from geometry.
  for (const which of ['start', 'end'] as const) {
    const handle = which === 'start' ? startHandle : endHandle;
    let drag: { fixed: Caret; grabX: number; grabY: number; lineOffset: number } | null = null;
    handle.addEventListener('pointerdown', (event) => {
      const both = ends();
      if (both === null) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const moving = which === 'start' ? both.start : both.end;
      const box = caretBox(moving);
      const centre = box.bottom + HANDLE_GAP;
      drag = {
        fixed: which === 'start' ? both.end : both.start,
        grabX: box.x - event.clientX,
        grabY: centre - event.clientY,
        lineOffset: centre - (box.top + box.bottom) / 2,
      };
    });
    handle.addEventListener('pointermove', (event) => {
      if (drag === null) return;
      const caret = caretFromPoint(event.clientX + drag.grabX, event.clientY + drag.grabY - drag.lineOffset);
      if (caret !== null) set(drag.fixed, caret);
    });
    for (const type of ['pointerup', 'pointercancel'] as const) handle.addEventListener(type, () => { drag = null; });
  }

  let frame = 0;
  scroller.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { render(); onChange(); });
  });

  return {
    getRange: () => range,
    clear,
    justCleared: () => performance.now() - clearedAt < 500,
  };
}
