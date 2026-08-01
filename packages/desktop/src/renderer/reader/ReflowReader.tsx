import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReflowParagraph } from '@taking-book/core';
import type { BookFile } from '../../shared/types';
import { useTheme } from '../theme';
import { Overlay } from './Overlay';

const HIDE_DELAY_MS = 2500;

interface ReflowReaderProps {
  file: BookFile;
  paragraphs: ReflowParagraph[];
  error: string | null;
  onClose: () => void;
  onToggleMode: () => void;
}

export function ReflowReader({ file, paragraphs, error, onClose, onToggleMode }: ReflowReaderProps) {
  const { cycleTheme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const hideTimerRef = useRef<number>(0);

  const baseSize = Math.max(...paragraphs.map((p) => p.fontSize).filter((f) => f > 0), 11);
  const total = paragraphs.length;
  const currentIndex = Math.min(
    Math.max(Math.floor((scrollTop / Math.max(scrollRef.current?.scrollHeight ?? 1, 1)) * total), 0),
    total - 1,
  );
  const position = useRef({ page: 1, position: 0 });
  const saveTimerRef = useRef<number>(0);

  const savePosition = useCallback(
    () => {
      const el = scrollRef.current;
      if (!el) return;
      const scrollable = Math.max(el.scrollHeight - el.clientHeight, 0);
      const frac = scrollable > 0 ? el.scrollTop / scrollable : 0;
      position.current = { page: 1, position: frac };
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        window.api.saveLastPosition(file.id, 1, position.current.position);
      }, 400);
    },
    [file.id],
  );

  useEffect(() => {
    const saveNow = () => {
      window.clearTimeout(saveTimerRef.current);
      window.api.saveLastPosition(file.id, 1, position.current.position);
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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    savePosition();
  }, [savePosition, total]);

  return (
    <div className="reader-root" onMouseMove={reveal}>
      {error ? (
        <div className="reader-error">
          <p>Could not extract text from this document.</p>
          <pre>{error}</pre>
          <button onClick={onClose}>Back</button>
        </div>
      ) : paragraphs.length === 0 ? (
        <div className="reader-loading">
          <p>Reflowing…</p>
        </div>
      ) : (
        <div className="reflow-viewport" ref={scrollRef} onScroll={handleScroll} onClick={handleClick}>
          <article className="reflow-article" style={{ fontSize: baseSize }}>
            {paragraphs.map((para, i) => (
              <p
                key={i}
                className="reflow-para"
                style={{
                  fontSize: para.fontSize,
                  textIndent: para.indent ? '1.6em' : undefined,
                }}
              >
                {para.text}
              </p>
            ))}
          </article>
        </div>
      )}
      {!error && (
        <Overlay
          visible={overlayVisible}
          title={`${file.title} — reflow`}
          page={currentIndex + 1}
          total={total}
          mode="reflow"
          onToggleMode={onToggleMode}
          onClose={onClose}
          onSeek={(n) => {
            const el = scrollRef.current;
            if (!el) return;
            const target = (n / Math.max(total, 1)) * el.scrollHeight;
            el.scrollTo({ top: target, behavior: 'smooth' });
          }}
          onCycleTheme={cycleTheme}
        />
      )}
    </div>
  );
}
