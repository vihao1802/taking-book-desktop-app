import { useEffect, useMemo, useRef } from 'react';
import { isOk, type ReflowParagraph } from '@taking-book/core';
import type { Annotation } from '../../shared/types';
import { fillReflowAnchors } from './note-anchor';

interface UseReflowAnchorsOptions {
  /** The open book's annotations as stored. */
  annotations: Annotation[];
  /** The book's reflow paragraphs. */
  paragraphs: readonly ReflowParagraph[];
  /** True once extraction has finished: paragraph indexes are only final after the last pass. */
  reflowTextReady: boolean;
}

/** What `useReflowAnchors` hands back. */
export interface ReflowAnchored {
  annotations: Annotation[];
  extraSegments: Annotation[];
}

const NONE: Annotation[] = [];

/**
 * Gives annotations made in page view their reflow anchor. Page view does not
 * extract reflow text (it would slow paging down), so a highlight made there is
 * stored without a paragraph and would otherwise stay invisible in reflow and
 * fail to jump. Once the text is ready the anchors are worked out here, so the
 * very render that has the paragraphs already shows them, and each is saved
 * once so the next open does not have to redo it. A quote that runs across
 * paragraphs is not saved (its anchor covers only the first paragraph); it is
 * worked out again each time instead.
 *
 * @returns The annotations with every anchor that could be found filled in, and
 *   the pieces of multi-paragraph quotes after their first, to paint in reflow view.
 */
export function useReflowAnchors({ annotations, paragraphs, reflowTextReady }: UseReflowAnchorsOptions): ReflowAnchored {
  const { anchored, filled, extraSegments } = useMemo(() => {
    if (!reflowTextReady) return { anchored: annotations, filled: NONE, extraSegments: NONE };
    const result = fillReflowAnchors(annotations, paragraphs);
    return { anchored: result.annotations, filled: result.filled, extraSegments: result.extraSegments };
  }, [annotations, paragraphs, reflowTextReady]);

  // A failed save is not retried in a loop: the anchor is derived again the
  // next time reflow text is ready, and nothing here blocks reading.
  const attemptedRef = useRef(new Set<number>());
  useEffect(() => {
    for (const annotation of filled) {
      if (attemptedRef.current.has(annotation.id)) continue;
      attemptedRef.current.add(annotation.id);
      const { paraIndex, paraStart, paraEnd } = annotation;
      if (paraIndex === null || paraStart === null || paraEnd === null) continue;
      window.api
        .setAnnotationReflowAnchor(annotation.id, { paraIndex, paraStart, paraEnd })
        .then((result) => {
          if (!isOk(result)) console.warn(`Could not save the reflow anchor of annotation ${annotation.id}:`, result.error);
        })
        .catch((error: unknown) => console.warn(`Could not save the reflow anchor of annotation ${annotation.id}:`, error));
    }
  }, [filled]);

  return { annotations: anchored, extraSegments };
}
