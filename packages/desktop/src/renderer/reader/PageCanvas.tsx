import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface PageCanvasProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  cssScale: number;
  dpr: number;
}

export function PageCanvas({ pdf, pageNumber, cssScale, dpr }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  return <canvas ref={canvasRef} className="pdf-page" />;
}
