import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Annotation, AnnotationColor } from '../../shared/types';
import { AnnotationPopup } from './AnnotationPopup';
import { SelectionToolbar } from './SelectionToolbar';
import {
  computeHighlightRects,
  HIGHLIGHT_FILL,
  rangeGlobalOffsets,
  selectionRect,
  type HighlightRect,
} from './highlights';

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
  onCreate: (
    selection: PageTextSelection,
    color: AnnotationColor,
    note: string | null,
  ) => Promise<Annotation | null>;
  onSetNote: (id: number, note: string | null) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

/**
 * One rendered page: pdf.js canvas, an overlaid selection text layer, and the
 * highlight/comment overlays anchored to the page's text offsets. The text
 * layer is transparent (pdf.js text is selectable, not visible) so selection
 * works exactly as it does in reflow mode.
 */
export function PdfPageView({
  pdf,
  pageNumber,
  cssScale,
  dpr,
  pageText,
  annotations,
  onCreate,
  onSetNote,
  onDelete,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [textLayerReady, setTextLayerReady] = useState(false);
  const [highlightRects, setHighlightRects] = useState<Map<number, HighlightRect[]>>(new Map());
  const [toolbar, setToolbar] = useState<{ selection: PageTextSelection; x: number; y: number } | null>(null);
  const [popup, setPopup] = useState<{ annotation: Annotation; x: number; y: number } | null>(null);

  // Render the canvas for this page.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: cssScale * dpr });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`;
      if (cancelled) return;
      task = page.render({ canvas, viewport });
      await task.promise;
    })().catch((err) => {
      if (!cancelled) console.error(`Failed to render page ${pageNumber}`, err);
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
    let cancelled = false;
    let layer: TextLayer | null = null;
    container.innerHTML = '';
    setTextLayerReady(false);
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: cssScale });
      if (cancelled) return;
      container.style.width = `${Math.ceil(viewport.width)}px`;
      container.style.height = `${Math.ceil(viewport.height)}px`;
      const textContentSource = await page.streamTextContent();
      if (cancelled) return;
      layer = new TextLayer({ textContentSource, container, viewport });
      await layer.render();
      if (!cancelled) setTextLayerReady(true);
    })();
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
    setHighlightRects(byAnnotation);
  }, [textLayerReady, annotations, pageNumber, cssScale]);

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
    const quote = pageText.slice(start, end);
    setPopup(null);
    setToolbar({
      selection: { page: pageNumber, start, end, quote },
      x: rect.left,
      y: rect.bottom + 8,
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
    if (!hasSelection) {
      setToolbar(null);
      setPopup(null);
    }
  };

  const highlight = async (color: AnnotationColor) => {
    if (!toolbar) return;
    await onCreate(toolbar.selection, color, null);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  };

  const comment = async () => {
    if (!toolbar) return;
    const created = await onCreate(toolbar.selection, 'yellow', null);
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
    if (created) {
      setPopup({ annotation: created, x: toolbar.x, y: toolbar.y });
    }
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
      {Array.from(highlightRects.entries()).flatMap(([id, rects]) =>
        (annotations.find((a) => a.id === id) ? rects : []).map((rect, i) => (
          <div
            key={`${id}-${i}`}
            className="absolute cursor-pointer"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              backgroundColor: HIGHLIGHT_FILL[annotations.find((a) => a.id === id)!.color],
              borderRadius: 2,
            }}
            onClick={(e) => {
              e.stopPropagation();
              const annotation = annotations.find((a) => a.id === id);
              if (!annotation) return;
              setPopup({ annotation, x: e.clientX, y: e.clientY });
            }}
            title={annotations.find((a) => a.id === id)?.note ?? undefined}
          />
        )),
      )}
      {toolbar && (
        <SelectionToolbar x={toolbar.x} y={toolbar.y} onHighlight={highlight} onComment={comment} />
      )}
      {popup && (
        <AnnotationPopup
          annotation={popup.annotation}
          x={popup.x}
          y={popup.y}
          onSaveNote={(note) => void onSetNote(popup.annotation.id, note)}
          onDelete={() => {
            void onDelete(popup.annotation.id);
            setPopup(null);
          }}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}