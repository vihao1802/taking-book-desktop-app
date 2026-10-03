// PROTOTYPE, THROWAWAY. Questions (ADR-0009 exit criteria + tablet layout ticket):
//  1. Does touch text selection over the pdf.js TextLayer work, with our toolbar below the selection?
//  2. Does tapping the middle of the page toggle the chrome without fighting selection/scroll?
//  3. Do large PDFs stay inside memory when only near-visible pages are rendered?
//  4. Does layout follow the window size class (600dp / 840dp), incl. rotation and split-screen?
import './style.css';
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
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  holder.append(layer);
  await new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport }).render();
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

// 1. selection toolbar below the selection
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) { toolbar.hidden = true; return; }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  toolbar.hidden = false;
  toolbar.style.top = `${Math.min(rect.bottom + 28, window.innerHeight - 64)}px`; // 28px clears the native handles
  toolbar.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - toolbar.offsetWidth - 8))}px`;
});
// Toolbar actions: wired only to prove a tap on our toolbar neither loses the selection nor gets swallowed.
function toast(text: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}
function highlightSelection(): void {
  const sel = getSelection();
  if (!sel || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
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
  sel.removeAllRanges();
}
toolbar.querySelectorAll('button').forEach((button) => {
  button.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the selection alive while tapping
  button.addEventListener('click', () => {
    const text = getSelection()?.toString().trim() ?? '';
    if (button.textContent === 'Highlight') highlightSelection();
    else toast(`${button.textContent}: "${text.slice(0, 40)}"`);
  });
});

document.addEventListener('contextmenu', (e) => e.preventDefault()); // try to suppress the native menu

// 2. tap the middle of the page to toggle chrome
scroller.addEventListener('click', (e) => {
  if (!getSelection()?.isCollapsed) return;
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
