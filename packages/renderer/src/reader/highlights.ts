import type { AnnotationColor } from '@/reader-api';

/**
 * Shared helpers for reader annotations. These are pure DOM/string utilities
 * used by both the page (canvas + text layer) and reflow views so the two
 * modes can highlight and take notes on the same underlying text.
 */

/** Highlight colors offered in the selection toolbar, in display order. */
export const HIGHLIGHT_COLORS: AnnotationColor[] = ['yellow', 'green', 'blue', 'pink'];

/** Translucent fill for a highlight color, readable on light and dark pages. */
export const HIGHLIGHT_FILL: Record<AnnotationColor, string> = {
  yellow: 'rgba(250, 204, 21, 0.5)',
  green: 'rgba(74, 222, 128, 0.5)',
  blue: 'rgba(96, 165, 250, 0.5)',
  pink: 'rgba(244, 114, 182, 0.5)',
};

/** A rectangle relative to a page/text container, in CSS pixels. */
export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds `needle` inside `haystack` ignoring all whitespace, returning the
 * original (un-normalized) offsets. Page text and reflow text differ in how
 * they join fragments (spaces are inserted by reflow where gaps exist), so
 * matching must be whitespace-insensitive for an anchor made in one mode to
 * locate its text in the other.
 */
export function findRangeIgnoringWhitespace(
  haystack: string,
  needle: string,
): [number, number] | null {
  if (!needle) return null;
  const indexMap: number[] = [];
  let stripped = '';
  for (let i = 0; i < haystack.length; i++) {
    if (/\s/.test(haystack[i])) continue;
    indexMap.push(i);
    stripped += haystack[i];
  }
  const target = needle.replace(/\s+/g, '');
  if (!target) return null;
  const index = stripped.indexOf(target);
  if (index === -1) return null;
  const start = indexMap[index];
  const end = indexMap[index + target.length - 1] + 1;
  return [start, end];
}

/**
 * Converts a selection range into `[start, end)` character offsets over the
 * text inside `root`, in DOM text-node order. Returns null when the range
 * boundaries do not both live inside `root` (e.g. a selection spanning pages).
 */
export function rangeGlobalOffsets(root: HTMLElement, range: Range): [number, number] | null {
  let acc = 0;
  let start = -1;
  let end = -1;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const length = node.data.length;
    if (start === -1 && node === range.startContainer) {
      start = acc + range.startOffset;
    }
    if (end === -1 && node === range.endContainer) {
      end = acc + range.endOffset;
    }
    if (end !== -1) break;
    acc += length;
    node = walker.nextNode() as Text | null;
  }
  if (start === -1 || end === -1) return null;
  return [start, end];
}

/** Returns the current selection's bounding rectangle, if it is non-empty. */
export function selectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

/**
 * Computes the screen-space rectangles a `[start, end)` text range occupies
 * inside `container`, used to draw highlight overlays over the pdf.js text
 * layer. Precise per-character rects come from a temporary Range over the
 * underlying text nodes.
 */
export function computeHighlightRects(
  container: HTMLElement,
  start: number,
  end: number,
): HighlightRect[] {
  if (start >= end) return [];
  const rects: HighlightRect[] = [];
  const containerRect = container.getBoundingClientRect();
  let acc = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const nodeStart = acc;
    const nodeEnd = acc + node.data.length;
    const from = Math.max(start, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (from < to) {
      const range = document.createRange();
      range.setStart(node, from - nodeStart);
      range.setEnd(node, to - nodeStart);
      for (const rect of range.getClientRects()) {
        rects.push({
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
        });
      }
    }
    acc = nodeEnd;
    if (acc >= end) break;
    node = walker.nextNode() as Text | null;
  }
  return rects;
}

/**
 * Builds a DOM Range over the `[start, end)` character offsets of the text
 * inside `root`, counted in text-node order like `rangeGlobalOffsets`. Used
 * to paint search matches; returns null when the offsets are not all inside
 * `root` (e.g. the text layer has not rendered yet).
 */
export function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  if (start >= end) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let startNode: Text | null = null;
  let startOffset = 0;
  let acc = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const nodeStart = acc;
    const nodeEnd = acc + node.data.length;
    if (!startNode && start < nodeEnd) {
      startNode = node;
      startOffset = start - nodeStart;
    }
    if (startNode && end <= nodeEnd) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(node, end - nodeStart);
      return range;
    }
    acc = nodeEnd;
    node = walker.nextNode() as Text | null;
  }
  return null;
}
