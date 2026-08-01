import { useCallback, useEffect, useRef, useState } from 'react';
import { isOk } from '@taking-book/core';
import type { BookFile } from '../../shared/types';
import { useTheme } from '../theme';
import { Overlay } from './Overlay';
import { fileUrl, useElementSize, usePageLayout, usePdfDocument } from './pdf';
import { PdfPages, type PdfPagesHandle } from './PdfPages';

const HIDE_DELAY_MS = 2500;

export function Reader({ file, onClose }: { file: BookFile; onClose: () => void }) {
  const { cycleTheme } = useTheme();
  const { pdf, error: pdfError } = usePdfDocument(fileUrl(file.path));

  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<PdfPagesHandle>(null);
  const { width, height } = useElementSize(scrollRef);
  const layout = usePageLayout(pdf, width);

  const [initialPosition, setInitialPosition] = useState<number | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const hideTimerRef = useRef<number>(0);
  const positionRef = useRef({ page: 1, position: 0 });
  const saveTimerRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    window.api.getLastPosition(file.id).then((pos) => {
      if (!cancelled && isOk(pos) && pos.data) setInitialPosition(pos.data.position);
    });
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  useEffect(() => {
    positionRef.current.page = currentPage;
  }, [currentPage]);

  const savePosition = useCallback(
    (page: number, position: number) => {
      positionRef.current = { page, position };
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        window.api.saveLastPosition(file.id, positionRef.current.page, positionRef.current.position);
      }, 400);
    },
    [file.id],
  );

  useEffect(() => {
    const saveNow = () => {
      window.clearTimeout(saveTimerRef.current);
      window.api.saveLastPosition(file.id, positionRef.current.page, positionRef.current.position);
    };
    window.addEventListener('beforeunload', saveNow);
    return () => {
      window.removeEventListener('beforeunload', saveNow);
      saveNow();
    };
  }, [file.id]);

  const startHideTimer = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setOverlayVisible(false), HIDE_DELAY_MS);
  }, []);

  const reveal = useCallback(() => {
    setOverlayVisible(true);
    startHideTimer();
  }, [startHideTimer]);

  const handleClick = useCallback(() => {
    setOverlayVisible((visible) => {
      if (visible) {
        window.clearTimeout(hideTimerRef.current);
        return false;
      }
      startHideTimer();
      return true;
    });
  }, [startHideTimer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PageDown' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        pagesRef.current?.scrollToPage(currentPage + 1);
      } else if (e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        pagesRef.current?.scrollToPage(currentPage - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentPage]);

  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  const error = pdfError;
  const total = pdf?.numPages ?? 0;
  const ready =
    pdf != null && layout != null && height > 0 && initialPosition !== undefined;

  return (
    <div className="reader-root" onMouseMove={reveal}>
      {error ? (
        <div className="reader-error">
          <p>Could not open this document.</p>
          <pre>{error}</pre>
          <button onClick={onClose}>Back</button>
        </div>
      ) : ready ? (
        <div className="pdf-viewport" ref={scrollRef} onClick={handleClick}>
          <PdfPages
            ref={pagesRef}
            pdf={pdf}
            layout={layout}
            containerWidth={width}
            containerHeight={height}
            dpr={dpr}
            initialPosition={initialPosition}
            onScrollPosition={savePosition}
            onCurrentPage={setCurrentPage}
          />
        </div>
      ) : (
        <div className="reader-loading">
          <p>Loading…</p>
        </div>
      )}
      {!error && (
        <Overlay
          visible={overlayVisible}
          title={file.title}
          page={currentPage}
          total={total}
          onClose={onClose}
          onSeek={(p) => pagesRef.current?.scrollToPage(p)}
          onCycleTheme={cycleTheme}
        />
      )}
    </div>
  );
}
