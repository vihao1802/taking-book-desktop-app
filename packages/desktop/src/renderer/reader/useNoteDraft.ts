import { useCallback, useMemo, useRef, useState } from 'react';
import { isOk, type Result } from '@taking-book/core';
import type { Annotation, AnnotationColor, NoteAnchor, NoteDraft } from '../../shared/types';

/** Local id of the stand-in annotation that paints a draft's temporary highlight; real rows never have one. */
const DRAFT_ANNOTATION_ID = -1;

const DEFAULT_DRAFT_COLOR: AnnotationColor = 'yellow';

/** The unsaved Note, if any, and everything the Notes sidebar needs to edit it. */
export interface NoteDraftState {
  /** The draft being written; null when there is none. */
  draft: NoteDraft | null;
  /** Changes for every new draft, so its card remounts and takes focus even when it replaces another. */
  draftKey: number;
  saving: boolean;
  /** Why the last save failed, shown in the card; null otherwise. */
  error: string | null;
  /** Begins a draft on a passage, replacing any open draft without asking. */
  start: (anchor: NoteAnchor) => void;
  changeText: (text: string) => void;
  changeColor: (color: AnnotationColor) => void;
  /** Discards the draft and its temporary highlight; nothing is stored. */
  cancel: () => void;
  save: () => Promise<void>;
  /** The draft's passage as an annotation, for the page to paint as a temporary highlight. */
  highlight: Annotation | null;
}

interface OpenDraft {
  key: number;
  anchor: NoteAnchor;
  color: AnnotationColor;
  text: string;
}

interface UseNoteDraftOptions {
  fileHash: string;
  /** Stores the draft as a Note; the reader wires this to the annotation list so the Note appears in it. */
  saveNote: (draft: NoteDraft) => Promise<Result<Annotation>>;
}

/**
 * Holds the one Note draft of the open book. It lives in the reader, above both
 * reader modes, so it survives closing the Notes sidebar, turning pages and a
 * page/reflow toggle, and goes away with the reader when the book is left.
 * Nothing is stored until `save`.
 */
export function useNoteDraft({ fileHash, saveNote }: UseNoteDraftOptions): NoteDraftState {
  const [open, setOpen] = useState<OpenDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKeyRef = useRef(1);
  const openKeyRef = useRef<number | null>(null);
  // State alone cannot stop a second Cmd/Ctrl+Enter that lands before the re-render.
  const savingRef = useRef(false);

  const start = useCallback((anchor: NoteAnchor) => {
    const key = nextKeyRef.current++;
    openKeyRef.current = key;
    setError(null);
    setOpen({ key, anchor, color: DEFAULT_DRAFT_COLOR, text: '' });
  }, []);

  const edit = useCallback(
    (change: Partial<Pick<OpenDraft, 'text' | 'color'>>) =>
      setOpen((current) => (current ? { ...current, ...change } : current)),
    [],
  );
  const changeText = useCallback((text: string) => edit({ text }), [edit]);
  const changeColor = useCallback((color: AnnotationColor) => edit({ color }), [edit]);
  const cancel = useCallback(() => {
    // A save already on its way cannot be recalled; let it finish rather than
    // discard a draft that is about to be stored anyway.
    if (savingRef.current) return;
    openKeyRef.current = null;
    setError(null);
    setOpen(null);
  }, []);

  const save = useCallback(async () => {
    if (!open || savingRef.current) return;
    const saved = open;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const result = await saveNote({ ...saved.anchor, color: saved.color, text: saved.text });
    savingRef.current = false;
    setSaving(false);
    // The reader may have started a different draft while this one was saving;
    // only the draft that was saved is closed, and only its card shows the failure.
    if (openKeyRef.current !== saved.key) return;
    if (isOk(result)) {
      openKeyRef.current = null;
      setOpen(null);
    } else {
      setError(result.error);
    }
  }, [open, saveNote]);

  // Keyed on the anchor and color rather than the draft, so typing never
  // rebuilds the highlight the pages are painting.
  const anchor = open?.anchor;
  const color = open?.color;
  const highlight = useMemo(
    () => (anchor && color ? draftHighlight(fileHash, anchor, color) : null),
    [fileHash, anchor, color],
  );

  const draft = useMemo(() => (open ? { ...open.anchor, color: open.color, text: open.text } : null), [open]);

  return { draft, draftKey: open?.key ?? 0, saving, error, start, changeText, changeColor, cancel, save, highlight };
}

function draftHighlight(fileHash: string, anchor: NoteAnchor, color: AnnotationColor): Annotation {
  return {
    ...anchor,
    id: DRAFT_ANNOTATION_ID,
    uid: 'draft',
    fileHash,
    color,
    note: null,
    createdAt: '',
    updatedAt: 0,
    updatedBy: '',
  };
}
