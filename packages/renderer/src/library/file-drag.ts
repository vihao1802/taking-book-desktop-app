/** Decides, from the window's drag events, whether the Drop import overlay shows. */
export interface FileDragTracker {
  /** A `dragenter`; takes the drag's `dataTransfer.types` and returns whether the overlay shows. */
  enter: (types: readonly string[]) => boolean;
  /** A `dragleave`; takes the drag's `dataTransfer.types` and returns whether the overlay shows. */
  leave: (types: readonly string[]) => boolean;
  /** A `drop`; the overlay always hides. */
  drop: () => boolean;
}

/**
 * Creates the overlay rule for Drop import. Only drags carrying files from
 * the operating system count, so dragging selected text never shows it.
 * Moving onto a child element fires `dragenter` on the child before
 * `dragleave` on the parent, so enters and leaves are counted and the overlay
 * hides only when the count is back to zero, which keeps it from flickering.
 */
export function createFileDragTracker(): FileDragTracker {
  let depth = 0;
  return {
    enter: (types) => {
      if (isFileDrag(types)) depth += 1;
      return depth > 0;
    },
    leave: (types) => {
      if (isFileDrag(types)) depth = Math.max(0, depth - 1);
      return depth > 0;
    },
    drop: () => {
      depth = 0;
      return false;
    },
  };
}

/** Whether a drag carries files from the operating system, going by its `dataTransfer.types`. */
export function isFileDrag(types: readonly string[]): boolean {
  return types.includes('Files');
}

/**
 * The on-disk paths of dropped files, in drop order. A file with no path
 * (the platform returns an empty string, e.g. for content dragged out of
 * another app rather than from disk) cannot be imported and is left out.
 */
export function getDroppedFilePaths(files: Iterable<File>, getPathForFile: (file: File) => string): string[] {
  return Array.from(files, getPathForFile).filter((path) => path !== '');
}
