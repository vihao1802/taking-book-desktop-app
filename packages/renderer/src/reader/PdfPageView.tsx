import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { TextMatch } from '@taking-book/core';
import type { Annotation, AnnotationColor } from '@/reader-api';
import { SelectionToolbar } from './SelectionToolbar';
import { TranslationPopup } from './TranslationPopup';
import { useTranslationPopup } from './useTranslationPopup';
import type { SelectionAnchor } from './floating-placement';
import {
  computeHighlightRects,
  HIGHLIGHT_FILL,
  rangeFromOffsets,
  rangeGlobalOffsets,
  selectionRect,
  type HighlightRect,
} from './highlights';
import { clearSearchHighlights, setSearchHighlights } from './searchHighlights';
import { flashHighlight } from './flashHighlight';
import type { FinishNoteJump, NoteJump } from './useNoteJump';
import { getPageCached } from './pdf';

/** A selected stretch of text anchored to a PDF page's joined text content. */
export interface PageTextSelection {
  page: number;
  start: number;
  end: number;
  quote: string;
}

interface PdfPageViewProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  cssScale: number;
  dpr: number;
  pageText: string;
  annotations: Annotation[];
  /** Find-bar matches on this page, as offsets into its text layer. */
  searchMatches: TextMatch[];
  /** Index into `searchMatches` of the current match, or null when it is on another page. */
  activeSearchMatch: number | null;
  /** Non-zero while the current match still needs to be scrolled into view. */
  pendingReveal: number;
  onRevealed: (request: number) => void;
  /** Stores the selection as a plain Highlight. */
  onCreate: (selection: PageTextSelection, color: AnnotationColor) => Promise<Annotation | null>;
  /** Starts a Note draft on the selection; nothing is stored until the reader saves it. */
  onAddNote: (selection: PageTextSelection) => void;
  /** Called when the reader clicks a highlight on this page, to edit its card in the Notes sidebar. */
  onOpenAnnotation: (annotation: Annotation) => void;
  /** A jump to a passage on this page still to be carried out; null when there is none. */
  noteJump: NoteJump | null;
  onNoteJumpDone: FinishNoteJump;
}

/**
 * One rendered page: pdf.js canvas, an overlaid selection text layer, and the
 * highlight/note overlays anchored to the page's text offsets. The text
 * layer is transparent (pdf.js text is selectable, not visible) so selection
 * works exactly as it does in reflow mode. Memoized: the page list re-renders
 * as the view scrolls, and a page whose props did not change must not redo its
 * highlight layout.
 */
export const PdfPageView = memo(function PdfPageView({
  pdf,
  pageNumber,
  cssScale,
  dpr,
  pageText,
  annotations,
  searchMatches,
  activeSearchMatch,
  pendingReveal,
  onRevealed,
  onCreate,
  onAddNote,
  onOpenAnnotation,
  noteJump,
  onNoteJumpDone,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [textLayerReady, setTextLayerReady] = useState(false);
  const [highlightRects, setHighlightRects] = useState<Map<number, HighlightRect[]>>(new Map());
  const [toolbar, setToolbar] = useState<{ selection: PageTextSelection; anchor: SelectionAnchor } | null>(null);
  const translation = useTranslationPopup();

  // Render the canvas for this page.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (pdf.loadingTask.destroyed) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await getPageCached(pdf, pageNumber);
      const viewport = page.getViewport({ scale: cssScale * dpr });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`;
      if (cancelled) return;
      task = page.render({ canvas, viewport });
      await task.promise;
    })().catch((err) => {
      // Rendering a page while the document is being torn down is not a
      // failure: pdf.js rejects every in-flight call once the worker is gone.
      if (cancelled || pdf.loadingTask.destroyed) return;
      console.error(`Failed to render page ${pageNumber}`, err);
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, cssScale, dpr]);

  // Render the invisible text layer that makes text selectable on the canvas.
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container) return;
    if (pdf.loadingTask.destroyed) return;
    let cancelled = false;
    let layer: TextLayer | null = null;
    container.innerHTML = '';
    setTextLayerReady(false);
    (async () => {
      const page = await getPageCached(pdf, pageNumber);
      const viewport = page.getViewport({ scale: cssScale });
      if (cancelled) return;
      container.style.width = `${Math.ceil(viewport.width)}px`;
      container.style.height = `${Math.ceil(viewport.height)}px`;
      const textContentSource = await page.streamTextContent();
      if (cancelled) return;
      layer = new TextLayer({ textContentSource, container, viewport });
      await layer.render();
      if (!cancelled) setTextLayerReady(true);
    })().catch((err) => {
      // Same teardown race as the canvas render: ignore it.
      if (cancelled || pdf.loadingTask.destroyed) return;
      console.error(`Failed to build text layer for page ${pageNumber}`, err);
    });
    return () => {
      cancelled = true;
      layer?.cancel();
    };
  }, [pdf, pageNumber, cssScale]);

  // Compute highlight rects once the text layer has laid out its spans.
  useEffect(() => {
    if (!textLayerReady) return;
    const container = pageRef.current;
    if (!container) return;
    const byAnnotation = new Map<number, HighlightRect[]>();
    for (const annotation of annotations) {
      if (annotation.pageStart == null || annotation.pageEnd == null) continue;
      byAnnotation.set(annotation.id, computeHighlightRects(container, annotation.pageStart, annotation.pageEnd));
    }
    // A page with no highlights before and after keeps its state, so it does not re-render for nothing.
    setHighlightRects((previous) => (byAnnotation.size === 0 && previous.size === 0 ? previous : byAnnotation));
  }, [textLayerReady, annotations, pageNumber, cssScale]);

  // Carry out a jump to a Note on this page: bring its highlight to the middle
  // of the view and flash it. Waits for the highlight rects, which only exist
  // once the text layer has laid out; a highlight with no rects is text this
  // page no longer has at that offset, which counts as not found.
  useEffect(() => {
    if (!noteJump || !textLayerReady) return;
    const annotationId = noteJump.annotation.id;
    if (!highlightRects.has(annotationId)) return;
    const marks = pageRef.current?.querySelectorAll(`[data-annotation-id="${annotationId}"]`);
    if (!marks || marks.length === 0) {
      // The page may already be mounted, in which case the page list did not scroll to it.
      pageRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      onNoteJumpDone(noteJump.request, false);
      return;
    }
    marks[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    flashHighlight(marks);
    onNoteJumpDone(noteJump.request, true);
  }, [noteJump, textLayerReady, highlightRects, onNoteJumpDone]);

  // Paint find-bar matches over the text layer once it has laid out its spans.
  useEffect(() => {
    const layer = textLayerRef.current;
    if (!textLayerReady || !layer || searchMatches.length === 0) return;
    const ranges = searchMatches.map((match) => rangeFromOffsets(layer, match.start, match.end));
    const owner = `page-${pageNumber}`;
    setSearchHighlights(
      owner,
      ranges.filter((range): range is Range => range !== null),
      activeSearchMatch === null ? null : (ranges[activeSearchMatch] ?? null),
    );
    return () => clearSearchHighlights(owner);
  }, [textLayerReady, searchMatches, activeSearchMatch, pageNumber, cssScale]);

  // Bring the current match to the middle of the view. Only the request that
  // is still pending scrolls, so a page remounting later never re-scrolls.
  useEffect(() => {
    const layer = textLayerRef.current;
    if (!textLayerReady || !layer || activeSearchMatch === null || pendingReveal === 0) return;
    const match = searchMatches[activeSearchMatch];
    const range = rangeFromOffsets(layer, match.start, match.end);
    range?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    onRevealed(pendingReveal);
  }, [textLayerReady, searchMatches, activeSearchMatch, pendingReveal, onRevealed]);

  // Escape closes the selection toolbar first. Capture phase plus
  // preventDefault lets the reader-wide handler see it was consumed and keep
  // the reader open.
  useEffect(() => {
    if (!toolbar) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setToolbar(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [toolbar]);

  const handleMouseUp = () => {
    const container = pageRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setToolbar(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    const offsets = rangeGlobalOffsets(container, range);
    const rect = selectionRect();
    if (!offsets || !rect) return;
    const [start, end] = offsets;
    if (end <= start) {
      setToolbar(null);
      return;
    }
    // Prefer the DOM's selected string: full-document page texts are only
    // extracted in reflow mode now, and the selection text is exact whereas
    // slicing joined page text with DOM offsets is approximate.
    const quote = selection.toString() || pageText.slice(start, end);
    setToolbar({
      selection: { page: pageNumber, start, end, quote },
      anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
    });
  };

  // A text selection also fires click after mouseup; keep its toolbar until
  // the selection is gone.
  const handlePageClick = () => {
    const selection = window.getSelection();
    const hasSelection =
      selection &&
      !selection.isCollapsed &&
      selection.rangeCount > 0 &&
      pageRef.current?.contains(selection.getRangeAt(0).commonAncestorContainer);
    if (!hasSelection) setToolbar(null);
  };

  const openAnnotation = (event: MouseEvent, annotation: Annotation) => {
    // A click on a highlight is not a click on the page: it must not toggle the reader's overlay.
    event.stopPropagation();
    onOpenAnnotation(annotation);
  };

  const highlight = async (color: AnnotationColor) => {
    if (!toolbar) return;
    await onCreate(toolbar.selection, color);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  // The draft's temporary highlight replaces the browser selection, so the
  // selection is cleared to keep it from painting over the highlight.
  const addNote = () => {
    if (!toolbar) return;
    onAddNote(toolbar.selection);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  // The selection stays so the reader can see what the Translation is of.
  const translate = () => {
    if (!toolbar) return;
    translation.translate(toolbar.selection.quote, toolbar.anchor);
    setToolbar(null);
  };

  return (
    <div
      ref={pageRef}
      className="relative"
      onClick={handlePageClick}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className="block bg-white shadow-[0_1px_4px_rgba(0,0,0,0.14)]" />
      <div
        ref={textLayerRef}
        className="tb-text-layer"
        style={{ '--total-scale-factor': cssScale } as CSSProperties}
      />
      {Array.from(highlightRects.entries()).flatMap(([id, rects]) => {
        const annotation = annotations.find((a) => a.id === id);
        if (!annotation) return [];
        return rects.map((rect, i) => (
          <div
            key={`${id}-${i}`}
            data-annotation-id={id}
            className="absolute z-20 cursor-pointer"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: HIGHLIGHT_FILL[annotation.color],
              borderRadius: 2,
            }}
            title={annotation.note ?? undefined}
            onClick={(event) => openAnnotation(event, annotation)}
          />
        ));
      })}
      {toolbar && (
        <SelectionToolbar anchor={toolbar.anchor} onHighlight={highlight} onAddNote={addNote} onTranslate={translate} />
      )}
      {translation.popup && <TranslationPopup popup={translation.popup} onClose={translation.close} />}
    </div>
  );
});