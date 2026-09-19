import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** One node in the PDF outline (table of contents) tree. */
export interface PdfOutlineNode {
  id: string;
  title: string;
  /** 1-based page number, or null when the destination could not be resolved. */
  page: number | null;
  children: PdfOutlineNode[];
}

/** Narrowed shape of a pdf.js outline entry; only what resolution needs. */
interface RawOutlineEntry {
  title: string;
  dest: unknown;
  items: RawOutlineEntry[];
}

/**
 * Resolves an outline `dest` (a named-destination string or an explicit
 * destination array) to a 1-based page number. The array's page slot holds
 * either a page reference (`{ num, gen }`) or a 0-based page index — pdf.js
 * accepts both as valid explicit destinations — so both are handled here.
 * Anything unresolvable yields null instead of failing the whole outline.
 */
export async function resolveOutlinePage(
  pdf: Pick<PDFDocumentProxy, 'getDestination' | 'getPageIndex'>,
  dest: unknown,
): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit.length === 0) return null;
    const ref = explicit[0] as unknown;
    if (typeof ref === 'number') {
      return Number.isInteger(ref) && ref >= 0 ? ref + 1 : null;
    }
    if (typeof ref !== 'object' || ref === null || !('num' in ref)) return null;
    const index = await pdf.getPageIndex(ref as { num: number; gen: number });
    return index + 1;
  } catch {
    return null;
  }
}

/**
 * Loads the PDF outline (bookmarks / table of contents) and resolves each
 * entry's destination to a 1-based page number. Unresolvable entries keep
 * `page: null` instead of failing the whole tree, so a partially broken
 * outline never blocks reading.
 */
export function usePdfOutline(pdf: PDFDocumentProxy | null): {
  nodes: PdfOutlineNode[];
  loading: boolean;
} {
  const [nodes, setNodes] = useState<PdfOutlineNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pdf) {
      setNodes([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const convert = async (entries: RawOutlineEntry[], prefix: string): Promise<PdfOutlineNode[]> => {
      const out: PdfOutlineNode[] = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const id = `${prefix}${i}`;
        const page = entry.dest ? await resolveOutlinePage(pdf, entry.dest) : null;
        const children =
          entry.items && entry.items.length > 0 ? await convert(entry.items, `${id}-`) : [];
        out.push({ id, title: entry.title || 'Untitled', page, children });
        if (cancelled) return out;
      }
      return out;
    };

    (async () => {
      try {
        const raw = (await pdf.getOutline()) as RawOutlineEntry[] | null;
        if (cancelled) return;
        if (!raw || raw.length === 0) {
          setNodes([]);
          return;
        }
        setNodes(await convert(raw, ''));
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load PDF outline', err);
          setNodes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return { nodes, loading };
}
