// PROTOTYPE, THROWAWAY. Our own touch selection over the pdf.js text layer, used instead of the WebView's native
// selection. Why: dragging a native handle into empty space (for example right of a short last line) makes the
// WebView snap the selection end to the end of the whole text layer, because the spans are absolutely positioned.
// Here the caret under a finger is computed from span geometry (nearest line by y, then nearest span by x, then a
// binary search over characters), so it does not depend on how the WebView hit-tests.
//
// Behaviour agreed with the reader (modelled on WPS Mobile):
//  - a selection lives inside one page and stops at that page's first and last character;
//  - teardrop handles whose tip touches the caret and whose body hangs outward (flipped at a screen edge);
//  - the two handles swap roles smoothly when one is dragged past the other;
//  - a magnifier above the finger while dragging; the action toolbar only after the finger lifts;
//  - the page auto-scrolls while dragging only when the page is taller than the screen.

export interface CustomSelection {
  /** The selected range, or null when nothing is selected. */
  getRange(): Range | null;
  clear(): void;
  /** True for a short while after a tap cleared a selection, so that tap is not also read as "toggle the chrome". */
  justCleared(): boolean;
  /** True while the finger that made the selection is still down, or a handle is being dragged (the toolbar stays hidden). */
  isInteracting(): boolean;
}

interface Caret {
  node: Text;
  offset: number;
}

/** Selection granularity while dragging a handle; set once the reader says how WPS does it. */
const SNAP_TO_WORD = false;

const WORD_CHARACTER = /[\p{L}\p{N}_'’-]/u;
const LONG_PRESS_MS = 480;
const MOVE_SLOP_PX = 10;
const HANDLE_SIZE = 28;
const EDGE_ZONE_TOP = 120;
const EDGE_ZONE_BOTTOM = 100;
const MAGNIFIER = { width: 168, height: 58, zoom: 1.7 };

function pageOf(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>('.page') ?? null;
}

function leafTextNodes(page: HTMLElement): Text[] {
  const nodes: Text[] = [];
  for (const span of page.querySelectorAll<HTMLElement>('.textLayer span')) {
    const text = span.firstChild;
    if (text instanceof Text && text.length > 0 && !span.querySelector('span')) nodes.push(text);
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

/** The caret nearest to a point, searching only the given page, so a drag can never leave it. */
function caretFromPoint(x: number, y: number, page: HTMLElement): Caret | null {
  let best: { node: Text; dy: number; dx: number } | null = null;
  for (const node of leafTextNodes(page)) {
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

/** The selection's rectangles with the pieces on one line merged into one continuous band. */
function lineRects(range: Range): Array<{ left: number; top: number; right: number; bottom: number }> {
  const bands: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  for (const box of range.getClientRects()) {
    if (box.width < 1) continue;
    const band = bands.find((b) => Math.abs(b.top - box.top) < 3 && Math.abs(b.bottom - box.bottom) < 3);
    if (band) {
      band.left = Math.min(band.left, box.left);
      band.right = Math.max(band.right, box.right);
      band.top = Math.min(band.top, box.top);
      band.bottom = Math.max(band.bottom, box.bottom);
    } else bands.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
  }
  return bands;
}

/** Moves a caret to the edge of the word it is in: forward = the end of the word, else its start. */
function snapToWord(caret: Caret, forward: boolean): Caret {
  const text = caret.node.data;
  let offset = caret.offset;
  if (forward) while (offset < text.length && WORD_CHARACTER.test(text[offset]) && offset > 0 && WORD_CHARACTER.test(text[offset - 1])) offset += 1;
  else while (offset > 0 && WORD_CHARACTER.test(text[offset - 1]) && offset < text.length && WORD_CHARACTER.test(text[offset])) offset -= 1;
  return { node: caret.node, offset };
}

/** A selection stored as a page and character offsets within that page, so it survives the page being unloaded. */
interface LogicalSelection {
  page: string;
  start: number;
  end: number;
}

function indexIn(nodes: Text[], node: Text, offset: number): number {
  let total = 0;
  for (const candidate of nodes) {
    if (candidate === node) return total + offset;
    total += candidate.length;
  }
  return -1;
}

/** The caret at a character index; on a boundary between two pieces a start prefers the next piece, an end the previous. */
function pointAt(nodes: Text[], index: number, atStart: boolean): Caret | null {
  let total = 0;
  for (const node of nodes) {
    if (atStart ? index < total + node.length : index <= total + node.length) return { node, offset: index - total };
    total += node.length;
  }
  const last = nodes[nodes.length - 1];
  return last !== undefined && index === total ? { node: last, offset: last.length } : null;
}

function logicalFrom(range: Range): LogicalSelection | null {
  const page = pageOf(range.startContainer);
  const { startContainer, endContainer } = range;
  if (page === null || !(startContainer instanceof Text) || !(endContainer instanceof Text)) return null;
  const nodes = leafTextNodes(page);
  const start = indexIn(nodes, startContainer, range.startOffset);
  const end = indexIn(nodes, endContainer, range.endOffset);
  return start < 0 || end < 0 || !page.dataset.page ? null : { page: page.dataset.page, start, end };
}

export function installCustomSelection(options: { scroller: HTMLElement; onChange: () => void }): CustomSelection {
  const { scroller, onChange } = options;
  let range: Range | null = null;
  let logical: LogicalSelection | null = null;
  let clearedAt = -Infinity;
  let holding = false; // finger still down after a long press selected a word
  let dragging = false;

  const layer = document.createElement('div');
  layer.className = 'sel-layer';
  const makeHandle = (): HTMLElement => {
    const handle = document.createElement('div');
    handle.className = 'sel-handle';
    handle.hidden = true;
    layer.append(handle);
    return handle;
  };
  let startEl = makeHandle();
  let endEl = makeHandle();
  const magnifier = document.createElement('div');
  magnifier.className = 'magnifier';
  magnifier.hidden = true;
  const magnifierCanvas = document.createElement('canvas');
  const ratio = Math.min(devicePixelRatio, 3);
  magnifierCanvas.width = Math.round(MAGNIFIER.width * ratio);
  magnifierCanvas.height = Math.round(MAGNIFIER.height * ratio);
  magnifier.append(magnifierCanvas);
  layer.append(magnifier);
  document.body.append(layer);

  function ends(): { start: Caret; end: Caret } | null {
    if (range === null) return null;
    const { startContainer, startOffset, endContainer, endOffset } = range;
    if (!(startContainer instanceof Text) || !(endContainer instanceof Text)) return null;
    return { start: { node: startContainer, offset: startOffset }, end: { node: endContainer, offset: endOffset } };
  }

  /** Puts a teardrop's tip on a point; the body hangs outward unless that would leave the screen. */
  function placeHandle(handle: HTMLElement, tipX: number, tipY: number, hangLeft: boolean): void {
    let left = hangLeft;
    if (left && tipX - HANDLE_SIZE < 2) left = false;
    else if (!left && tipX + HANDLE_SIZE > window.innerWidth - 2) left = true;
    handle.classList.toggle('hang-left', left);
    handle.classList.toggle('hang-right', !left);
    handle.style.left = `${left ? tipX - HANDLE_SIZE : tipX}px`;
    handle.style.top = `${tipY}px`;
    handle.hidden = false;
  }

  function render(): void {
    for (const old of layer.querySelectorAll('.sel-rect')) old.remove();
    const both = ends();
    if (range === null || both === null) {
      startEl.hidden = endEl.hidden = true;
      return;
    }
    for (const band of lineRects(range)) {
      const mark = document.createElement('div');
      mark.className = 'sel-rect';
      mark.style.cssText = `left:${band.left}px;top:${band.top}px;width:${band.right - band.left}px;height:${band.bottom - band.top}px`;
      layer.insertBefore(mark, startEl);
    }
    const startBox = caretBox(both.start);
    const endBox = caretBox(both.end);
    placeHandle(startEl, startBox.x, startBox.bottom, true);
    placeHandle(endEl, endBox.x, endBox.bottom, false);
  }

  /** Sets the range between two carets; returns whether `to` ended up as the start of the range. */
  function set(from: Caret, to: Caret): boolean {
    const next = document.createRange();
    const toIsStart = !comesBefore(from, to);
    const [first, second] = toIsStart ? [to, from] : [from, to];
    next.setStart(first.node, first.offset);
    next.setEnd(second.node, second.offset);
    range = next;
    logical = logicalFrom(next);
    render();
    onChange();
    return toIsStart;
  }

  function clear(): void {
    if (range === null && logical === null) return;
    range = null;
    logical = null;
    clearedAt = performance.now();
    hideMagnifier();
    render();
    onChange();
  }

  /** Re-creates the range when its page was unloaded and has since been drawn again; null while it is unloaded. */
  function refresh(): void {
    if (logical === null) return;
    // When a page is unloaded the browser does not detach a Range: it collapses it onto a surviving parent element.
    // So "alive" means non-empty and still anchored in text nodes that are in the document.
    const { startContainer, endContainer } = range ?? {};
    const alive = range !== null && !range.collapsed && startContainer instanceof Text && startContainer.isConnected && endContainer instanceof Text && endContainer.isConnected;
    if (alive) return;
    range = null;
    const page = scroller.querySelector<HTMLElement>(`.page[data-page="${logical.page}"]`);
    if (!page) return;
    const nodes = leafTextNodes(page);
    const start = pointAt(nodes, logical.start, true);
    const end = pointAt(nodes, logical.end, false);
    if (!start || !end) return;
    const restored = document.createRange();
    restored.setStart(start.node, start.offset);
    restored.setEnd(end.node, end.offset);
    range = restored;
  }

  function selectWordAt(x: number, y: number): void {
    const page = pageOf(document.elementFromPoint(x, y));
    if (page === null) return;
    const caret = caretFromPoint(x, y, page);
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

  // Magnifier: redraws the page canvas around the caret, enlarged, together with the selection.
  function drawMagnifier(caret: Caret): void {
    const page = pageOf(caret.node);
    const source = page?.querySelector('canvas');
    const context = magnifierCanvas.getContext('2d');
    if (!page || !source || !context) return;
    const box = caretBox(caret);
    const centreX = box.x;
    const centreY = (box.top + box.bottom) / 2;
    const srcWidth = MAGNIFIER.width / MAGNIFIER.zoom;
    const srcHeight = MAGNIFIER.height / MAGNIFIER.zoom;
    const srcLeft = centreX - srcWidth / 2;
    const srcTop = centreY - srcHeight / 2;
    const canvasBox = source.getBoundingClientRect();
    const scale = source.width / canvasBox.width;
    context.clearRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);
    context.drawImage(source, (srcLeft - canvasBox.left) * scale, (srcTop - canvasBox.top) * scale, srcWidth * scale, srcHeight * scale, 0, 0, magnifierCanvas.width, magnifierCanvas.height);
    const k = (magnifierCanvas.width / srcWidth);
    context.fillStyle = 'rgba(66, 133, 244, 0.35)';
    for (const band of range ? lineRects(range) : []) {
      context.fillRect((band.left - srcLeft) * k, (band.top - srcTop) * k, (band.right - band.left) * k, (band.bottom - band.top) * k);
    }
    context.fillStyle = '#1e88e5';
    context.fillRect(magnifierCanvas.width / 2 - 1, 0, 2, magnifierCanvas.height);
    const left = Math.max(6, Math.min(centreX - MAGNIFIER.width / 2, window.innerWidth - MAGNIFIER.width - 6));
    magnifier.style.left = `${left}px`;
    magnifier.style.top = `${Math.max(84, box.top - MAGNIFIER.height - 22)}px`;
    magnifier.hidden = false;
  }
  function hideMagnifier(): void {
    magnifier.hidden = true;
  }

  // Long press on the text layer selects a word. A selection is cleared only by a tap, never by a scroll: a press
  // that moves (a scroll or a fling) leaves it alone, and the toolbar and handles follow the content.
  let press: { x: number; y: number; timer: number } | null = null;
  let tapCandidate = false;
  const cancelPress = (): void => {
    if (press !== null) clearTimeout(press.timer);
    press = null;
  };
  const endHolding = (): void => {
    if (!holding) return;
    holding = false;
    onChange();
  };
  scroller.addEventListener('pointerdown', (event) => {
    cancelPress();
    tapCandidate = true;
    const { clientX: x, clientY: y } = event;
    press = {
      x,
      y,
      timer: window.setTimeout(() => {
        press = null;
        tapCandidate = false;
        holding = true; // the toolbar stays hidden until the finger lifts
        selectWordAt(x, y);
      }, LONG_PRESS_MS),
    };
  });
  scroller.addEventListener('pointermove', (event) => {
    if (press !== null && Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_SLOP_PX) {
      cancelPress();
      tapCandidate = false;
    }
  });
  scroller.addEventListener('pointerup', () => {
    cancelPress();
    if (tapCandidate && (range !== null || logical !== null)) clear();
    tapCandidate = false;
    endHolding();
  });
  scroller.addEventListener('pointercancel', () => {
    // The browser takes the gesture over when it starts scrolling: not a tap.
    cancelPress();
    tapCandidate = false;
    endHolding();
  });

  // Dragging a handle: the other end stays fixed, the dragged end follows the caret computed from geometry.
  let autoScrollFrame = 0;
  for (const handle of [startEl, endEl]) {
    let drag: { fixed: Caret; page: HTMLElement; grabX: number; grabY: number; lineOffset: number; pointerX: number; pointerY: number } | null = null;

    const follow = (): void => {
      if (drag === null) return;
      const targetX = drag.pointerX + drag.grabX;
      const targetY = drag.pointerY + drag.grabY - drag.lineOffset;
      let caret = caretFromPoint(targetX, targetY, drag.page);
      if (caret === null) return;
      if (SNAP_TO_WORD) caret = snapToWord(caret, comesBefore(drag.fixed, caret));
      const toIsStart = set(drag.fixed, caret);
      // Roles swap when a handle is dragged past the other one, so the finger keeps holding the same teardrop.
      if ((toIsStart && handle !== startEl) || (!toIsStart && handle !== endEl)) {
        [startEl, endEl] = [endEl, startEl];
        render();
      }
      drawMagnifier(caret);
    };

    const autoScroll = (): void => {
      if (drag === null) return;
      const box = drag.page.getBoundingClientRect();
      const y = drag.pointerY;
      let step = 0;
      if (y > window.innerHeight - EDGE_ZONE_BOTTOM && box.bottom > window.innerHeight - 60) step = 4 + ((y - (window.innerHeight - EDGE_ZONE_BOTTOM)) / EDGE_ZONE_BOTTOM) * 14;
      else if (y < EDGE_ZONE_TOP && box.top < 90) step = -(4 + ((EDGE_ZONE_TOP - y) / EDGE_ZONE_TOP) * 14);
      if (step !== 0) {
        scroller.scrollTop += step;
        follow();
      }
      autoScrollFrame = requestAnimationFrame(autoScroll);
    };

    handle.addEventListener('pointerdown', (event) => {
      const both = ends();
      if (both === null) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      const movingIsStart = handle === startEl;
      const moving = movingIsStart ? both.start : both.end;
      const box = caretBox(moving);
      const page = pageOf(moving.node);
      if (page === null) return;
      dragging = true;
      onChange();
      drag = {
        fixed: movingIsStart ? both.end : both.start,
        page,
        grabX: box.x - event.clientX,
        grabY: box.bottom - event.clientY,
        lineOffset: box.bottom - (box.top + box.bottom) / 2,
        pointerX: event.clientX,
        pointerY: event.clientY,
      };
      drawMagnifier(moving);
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = requestAnimationFrame(autoScroll);
    });
    handle.addEventListener('pointermove', (event) => {
      if (drag === null) return;
      drag.pointerX = event.clientX;
      drag.pointerY = event.clientY;
      follow();
    });
    for (const type of ['pointerup', 'pointercancel'] as const) {
      handle.addEventListener(type, () => {
        if (drag === null) return;
        drag = null;
        dragging = false;
        cancelAnimationFrame(autoScrollFrame);
        hideMagnifier();
        onChange();
      });
    }
  }

  let frame = 0;
  const update = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      refresh();
      render();
      onChange();
    });
  };
  scroller.addEventListener('scroll', update);
  // A page that was unloaded and is drawn again brings the selection back.
  new MutationObserver(() => { if (logical !== null) update(); }).observe(scroller, { childList: true, subtree: true });

  return {
    getRange: () => range,
    clear,
    justCleared: () => performance.now() - clearedAt < 500,
    isInteracting: () => holding || dragging,
  };
}
