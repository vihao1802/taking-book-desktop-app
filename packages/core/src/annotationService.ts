import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  listLibraryAnnotations,
  setAnnotationColor,
  setAnnotationPageAnchor,
  setAnnotationReflowAnchor,
  type CreateAnnotationOptions,
  type PageAnchor,
  type ReflowAnchor,
} from './annotationsRepository';
import type { AnnotationUidGenerator } from './annotationUid';
import type { Annotation, AnnotationColor, CreateAnnotationInput } from './models';
import {
  deleteNote,
  saveNoteDraft,
  saveNoteText,
  savePageNote,
  type NoteDraft,
  type PageNoteInput,
} from './notesRepository';
import type { Result } from './result';
import type { SqlDriver } from './sql';
import type { SyncStamp } from './sync/types';

export interface AnnotationServiceOptions {
  /** Supplies the id of this device, so every local edit is stamped for the LWW sync clock. */
  getDeviceId: () => Promise<string>;
  /** Supplies each new annotation's stable uid; core has no platform randomness of its own. */
  generateUid: AnnotationUidGenerator;
  /** Current time in milliseconds; injectable for tests. */
  now?: () => number;
}

/** The database-backed Highlight and Note operations of the reader API. */
export interface AnnotationService {
  list(fileHash: string): Promise<Result<Annotation[]>>;
  listLibrary(): Promise<Result<Annotation[]>>;
  create(fileHash: string, input: CreateAnnotationInput): Promise<Result<Annotation>>;
  saveDraft(fileHash: string, draft: NoteDraft): Promise<Result<Annotation>>;
  savePageNote(fileHash: string, input: PageNoteInput): Promise<Result<Annotation>>;
  /** Saves trimmed Note text on an annotation. */
  saveNote(id: number, text: string): Promise<Result<Annotation>>;
  /** Removes a Note; resolves to null when it was a Page note and the whole annotation went with it. */
  deleteNote(id: number): Promise<Result<Annotation | null>>;
  setColor(id: number, color: AnnotationColor): Promise<Result<Annotation>>;
  /** Fills a missing page anchor. Derived data, so the sync clock is not touched. */
  setPageAnchor(id: number, anchor: PageAnchor): Promise<Result<Annotation>>;
  /** Fills a missing reflow anchor. Derived data, so the sync clock is not touched. */
  setReflowAnchor(id: number, anchor: ReflowAnchor): Promise<Result<Annotation>>;
  delete(id: number): Promise<Result<void>>;
}

/**
 * Creates the annotation service over a database. Every write is stamped with
 * the device id and current time; anchors are derived data and stay unstamped.
 *
 * @param db The started database.
 * @param options Device id source, uid generator, and a test clock.
 * @returns The operations desktop IPC handlers and mobile glue call into.
 */
export function createAnnotationService(db: SqlDriver, options: AnnotationServiceOptions): AnnotationService {
  const now = options.now ?? Date.now;

  async function stamp(): Promise<SyncStamp> {
    return { updatedAt: now(), updatedBy: await options.getDeviceId() };
  }

  async function createAnnotationOptions(): Promise<CreateAnnotationOptions> {
    return { stamp: await stamp(), generateUid: options.generateUid };
  }

  return {
    list: (fileHash) => listAnnotations(db, fileHash),
    listLibrary: () => listLibraryAnnotations(db),
    create: async (fileHash, input) => createAnnotation(db, fileHash, input, await createAnnotationOptions()),
    saveDraft: async (fileHash, draft) => saveNoteDraft(db, fileHash, draft, await createAnnotationOptions()),
    savePageNote: async (fileHash, input) => savePageNote(db, fileHash, input, await createAnnotationOptions()),
    saveNote: async (id, text) => saveNoteText(db, id, text, await stamp()),
    deleteNote: async (id) => deleteNote(db, id, await stamp()),
    setColor: async (id, color) => setAnnotationColor(db, id, color, await stamp()),
    setPageAnchor: (id, anchor) => setAnnotationPageAnchor(db, id, anchor),
    setReflowAnchor: (id, anchor) => setAnnotationReflowAnchor(db, id, anchor),
    delete: async (id) => deleteAnnotation(db, id, await stamp()),
  };
}
