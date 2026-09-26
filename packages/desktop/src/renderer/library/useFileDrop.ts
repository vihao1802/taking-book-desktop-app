import { useEffect, useState } from 'react';
import { createFileDragTracker, getDroppedFilePaths, isFileDrag } from './file-drag';
import { useLibrary } from './useLibrary';

/**
 * Drop import for the whole window while mounted: tracks files dragged from
 * the operating system and imports them on drop. Only the views outside the
 * reader mount it, so a drop onto the reader is left unhandled and does nothing.
 *
 * @returns Whether files are being dragged over the window, to show the overlay.
 */
export function useFileDrop(): boolean {
  const { importPaths } = useLibrary();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const tracker = createFileDragTracker();
    const dragTypesOf = (event: DragEvent): readonly string[] => event.dataTransfer?.types ?? [];
    const onDragEnter = (event: DragEvent): void => setDragging(tracker.enter(dragTypesOf(event)));
    const onDragLeave = (event: DragEvent): void => setDragging(tracker.leave(dragTypesOf(event)));
    // Without preventDefault on dragover the window refuses the drop.
    const onDragOver = (event: DragEvent): void => {
      if (!isFileDrag(dragTypesOf(event))) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent): void => {
      setDragging(tracker.drop());
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      const paths = getDroppedFilePaths(files, window.api.getPathForFile);
      // Imported even when empty, so the notice still says nothing was added.
      void importPaths(paths);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [importPaths]);

  return dragging;
}
