// PROTOTYPE, THROWAWAY. Questions (ADR-0009 exit criteria + tablet layout ticket):
//  1. Does touch text selection over the pdf.js TextLayer work, with our toolbar below the selection?
//  2. Does tapping the middle of the page toggle the chrome without fighting selection/scroll?
//  3. Do large PDFs stay inside memory when only near-visible pages are rendered?
//  4. Does layout follow the window size class (600dp / 840dp), incl. rotation and split-screen?
import './style.css';
import { installCustomSelection, type CustomSelection } from './custom-selection';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const scroller = $('scroller');
const pagesEl = $('pages');
const toolbar = $('toolbar');
const debugEl = $('debug');

let doc: pdfjs.PDFDocumentProxy | null = null;
const rendered = new Map<number, { cancel: () => void }>();
const NEAR = '1500px 0px';

// Text-layer variants under test (ticket: touch selection handles). Persisted so a reload keeps the choice.
type Variant = 'raw' | 'builder' | 'custom';
const VARIANTS: Variant[] = ['raw', 'builder', 'custom'];
function readVariant(): Variant {
  const forced = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_VARIANT;
  const forcedVariant = VARIANTS.find((v) => v === forced);
  if (forcedVariant) return forcedVariant;
  try {
    const stored = localStorage.getItem('tb-variant');
    return VARIANTS.find((v) => v === stored) ?? 'custom';
  } catch {
    return 'custom';
  }
}
const variant: Variant = readVariant();
type Viewer = typeof import('pdfjs-dist/legacy/web/pdf_viewer.mjs');
let viewerPromise: Promise<Viewer> | null = null;
function loadViewer(): Promise<Viewer> {
  // The viewer module reads globalThis.pdfjsLib at load time, so it must be imported after that is set.
  (globalThis as unknown as { pdfjsLib: unknown }).pdfjsLib = pdfjs;
  viewerPromise ??= import('pdfjs-dist/legacy/web/pdf_viewer.mjs');
  return viewerPromise;
}

function sizeClass(): string {
  const w = window.innerWidth;
  return w < 600 ? 'compact' : w < 840 ? 'medium' : 'expanded';
}

function heapMb(): string {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? `${(mem.usedJSHeapSize / 1048576).toFixed(0)}MB` : 'n/a';
}

function refreshDebug(): void {
  debugEl.textContent = [
    `pdf.js ${pdfjs.version}`,
    `UA ${navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] ?? navigator.userAgent}`,
    `${window.innerWidth}x${window.innerHeight}dp @${devicePixelRatio}x -> ${sizeClass()}`,
    `pages rendered ${rendered.size}/${doc?.numPages ?? 0}  heap ${heapMb()}`,
  ].join('\n');
}

async function renderPage(num: number, holder: HTMLElement): Promise<void> {
  if (!doc || rendered.has(num)) return;
  let cancelled = false;
  rendered.set(num, { cancel: () => (cancelled = true) });
  const page = await doc.getPage(num);
  if (cancelled) return;
  const base = page.getViewport({ scale: 1 });
  const scale = (scroller.clientWidth - 16) / base.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ratio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  holder.style.setProperty('--scale-factor', String(scale));
  holder.style.setProperty('--total-scale-factor', String(scale));
  holder.replaceChildren(canvas);
  await page.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] }).promise;
  if (cancelled) return;
  if (variant === 'builder') {
    // pdf.js's own viewer text layer: adds endOfContent, the `selecting` class and the Chromium selection workaround.
    const { TextLayerBuilder } = await loadViewer();
    const builder = new TextLayerBuilder({ pdfPage: page });
    await builder.render({ viewport, images: null });
    if (cancelled) return;
    holder.append(builder.div);
  } else {
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    holder.append(layer);
    await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport }).render();
  }
  page.cleanup();
  refreshDebug();
}

function releasePage(num: number, holder: HTMLElement): void {
  rendered.get(num)?.cancel();
  rendered.delete(num);
  holder.replaceChildren();
  refreshDebug();
}

async function openPdf(file: File): Promise<void> {
  pagesEl.replaceChildren();
  rendered.clear();
  doc?.destroy();
  doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const scale = (scroller.clientWidth - 16) / base.width;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const holder = entry.target as HTMLElement;
        const num = Number(holder.dataset.page);
        if (entry.isIntersecting) void renderPage(num, holder);
        else releasePage(num, holder);
      }
    },
    { root: scroller, rootMargin: NEAR },
  );
  for (let n = 1; n <= doc.numPages; n++) {
    const holder = document.createElement('div');
    holder.className = 'page';
    holder.dataset.page = String(n);
    holder.style.width = `${base.width * scale}px`;
    holder.style.height = `${base.height * scale}px`;
    pagesEl.append(holder);
    observer.observe(holder);
  }
  $('info').textContent = `${file.name} (${doc.numPages}p, ${(file.size / 1048576).toFixed(1)}MB)`;
}

// 1. selection toolbar below the selection. The selection is the WebView's native one, or our own in the `custom` variant.
let customSelection: CustomSelection | null = null;
let selectionClearedAt = -Infinity;
function getSelectedRange(): Range | null {
  if (customSelection) return customSelection.getRange();
  const sel = getSelection();
  return sel && !sel.isCollapsed && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
}
function clearSelection(): void {
  if (customSelection) customSelection.clear();
  else getSelection()?.removeAllRanges();
}
function updateToolbar(): void {
  const range = getSelectedRange();
  // Hidden while the finger that made the selection is still down or a handle is dragged; it shows once the finger
  // lifts, and then follows the content when the reader scrolls.
  if (!range || customSelection?.isInteracting()) {
    if (!range && !toolbar.hidden) selectionClearedAt = performance.now();
    toolbar.hidden = true;
    return;
  }
  const rect = range.getBoundingClientRect();
  // Scrolled completely out of view: nothing to attach the toolbar to.
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    toolbar.hidden = true;
    return;
  }
  const wasHidden = toolbar.hidden;
  toolbar.hidden = false;
  // Below the selection and its teardrop handles (28px tall); flipped above when there is no room underneath, and
  // kept between the top and bottom bars while the selection is only partly on screen.
  const gap = customSelection ? 44 : 28;
  const height = toolbar.offsetHeight || 64;
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - 70) top = rect.top - height - 12;
  top = Math.max(84, Math.min(top, window.innerHeight - 70 - height));
  toolbar.style.top = `${top}px`;
  toolbar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - toolbar.offsetWidth - 8))}px`;
  if (wasHidden) {
    // Slide up from below: start offset and transparent, then let the transition run.
    toolbar.classList.add('enter');
    void toolbar.offsetWidth;
    toolbar.classList.remove('enter');
  }
}
document.addEventListener('selectionchange', () => { if (!customSelection) updateToolbar(); });
// Toolbar actions: wired only to prove a tap on our toolbar neither loses the selection nor gets swallowed.
function toast(text: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}
function highlightSelection(): void {
  const range = getSelectedRange();
  if (!range) return;
  const node = range.commonAncestorContainer;
  const holder = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('.page');
  if (!holder) return toast('Select text inside a page');
  const origin = holder.getBoundingClientRect();
  for (const r of range.getClientRects()) {
    const mark = document.createElement('div');
    mark.className = 'hl';
    mark.style.cssText = `left:${r.left - origin.left}px;top:${r.top - origin.top}px;width:${r.width}px;height:${r.height}px`;
    holder.append(mark);
  }
  clearSelection();
}
toolbar.querySelectorAll('button').forEach((button) => {
  button.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the selection alive while tapping
  button.addEventListener('click', () => {
    const text = getSelectedRange()?.toString().trim() ?? '';
    if (button.textContent === 'Highlight') highlightSelection();
    else toast(`${button.textContent}: "${text.slice(0, 40)}"`);
  });
});

document.addEventListener('contextmenu', (e) => e.preventDefault()); // try to suppress the native menu

// 2. tap the middle of the page to toggle chrome
scroller.addEventListener('click', (e) => {
  // A tap that just cleared a selection must not also toggle the chrome (found on the first phone test).
  if (getSelectedRange() || performance.now() - selectionClearedAt < 500 || customSelection?.justCleared()) return;
  const third = scroller.clientWidth / 3;
  if (e.clientX > third && e.clientX < third * 2) document.body.classList.toggle('chrome-hidden');
});

// 4. layout
$('notes-btn').addEventListener('click', () => document.body.classList.toggle('notes-open'));
$('pick').addEventListener('click', () => $<HTMLInputElement>('file').click());
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void openPdf(file);
});
scroller.addEventListener('scroll', () => {
  const holders = [...pagesEl.children] as HTMLElement[];
  const mid = scroller.scrollTop + scroller.clientHeight / 2;
  const cur = holders.find((h) => h.offsetTop + h.offsetHeight > mid);
  $('page-info').textContent = cur ? `page ${cur.dataset.page}/${holders.length}` : '';
  if (cur) console.log(`TBPAGE ${cur.dataset.page}`);
});
window.addEventListener('resize', refreshDebug);
setInterval(refreshDebug, 2000);
refreshDebug();

// Prototype convenience: auto-open a bundled sample.pdf (git-ignored) so emulator runs need no file picker.
void fetch('/sample.pdf').then(async (res) => {
  if (res.ok && (res.headers.get('content-type') ?? '').includes('pdf')) {
    await openPdf(new File([await res.blob()], 'sample.pdf'));
  }
});

// Variant switch button + selection tracing (read with: adb logcat -s Capacitor/Console).
const variantButton = document.createElement('button');
variantButton.textContent = `text: ${variant}`;
variantButton.addEventListener('click', () => {
  const next = VARIANTS[(VARIANTS.indexOf(variant) + 1) % VARIANTS.length];
  try { localStorage.setItem('tb-variant', next); } catch { /* ignore */ }
  location.reload();
});
$('bar-top').insertBefore(variantButton, $('info'));

function describeNode(node: Node | null, offset: number): string {
  const el = node instanceof Element ? node : node?.parentElement;
  const span = el?.closest('span');
  const page = el?.closest<HTMLElement>('.page')?.dataset.page ?? '?';
  const y = span ? Math.round(span.getBoundingClientRect().top) : -1;
  const text = (span?.textContent ?? '').slice(0, 14).replace(/\s+/g, ' ');
  return `p${page}@${offset} y=${y} "${text}"`;
}
function logSelection(): void {
  const range = getSelectedRange();
  if (!range) return;
  console.log(`TBSEL ${variant} len=${range.toString().length} anchor=${describeNode(range.startContainer, range.startOffset)} focus=${describeNode(range.endContainer, range.endOffset)}`);
}
document.addEventListener('selectionchange', () => { if (!customSelection) logSelection(); });
if (variant === 'custom') {
  document.body.classList.add('custom-sel');
  customSelection = installCustomSelection({ scroller, onChange: () => { updateToolbar(); logSelection(); } });
}

// Measurement aid: log where the 4 lines of the target paragraph are on screen (CSS px) so a harness need not guess.
function logParagraphPosition(): void {
  const leaves = [...document.querySelectorAll<HTMLElement>('.textLayer span')].filter((el) => !el.querySelector('span') && !el.classList.contains('markedContent'));
  const first = leaves.findIndex((el) => (el.textContent ?? '').startsWith('Many applications today'));
  if (first < 0) return;
  const ys: number[] = [];
  let left = Infinity;
  let right = 0;
  for (const el of leaves.slice(first, first + 60)) {
    const r = el.getBoundingClientRect();
    const y = Math.round(r.top + r.height / 2);
    let index = ys.findIndex((v) => Math.abs(v - y) < 4);
    if (index < 0) {
      if (ys.length === 4) break;
      ys.push(y);
      index = ys.length - 1;
    }
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  console.log(`TBPOS left=${Math.round(left)} right=${Math.round(right)} ys=${ys.join(',')}`);
}
let positionTimer: ReturnType<typeof setTimeout> | undefined;
scroller.addEventListener('scroll', () => {
  clearTimeout(positionTimer);
  positionTimer = setTimeout(logParagraphPosition, 700);
});
setInterval(logParagraphPosition, 1500);
