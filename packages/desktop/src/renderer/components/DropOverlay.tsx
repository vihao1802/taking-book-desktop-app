import { FileUp } from 'lucide-react';
import { useFileDrop } from '@/library/useFileDrop';

/** The full-window overlay shown while PDFs are dragged over the app, for Drop import. */
export function DropOverlay() {
  const dragging = useFileDrop();
  if (!dragging) return null;

  return (
    <div
      aria-hidden="true"
      className="bg-overlay text-foreground pointer-events-none fixed inset-0 z-30 flex p-4"
    >
      <div className="border-primary flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed">
        <FileUp className="text-primary size-10" />
        <p className="text-lg font-medium">Drop PDFs to add them to your library</p>
      </div>
    </div>
  );
}
