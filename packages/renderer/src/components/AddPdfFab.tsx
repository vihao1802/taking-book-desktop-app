import type { ReactElement } from 'react';
import { Loader2, Plus } from 'lucide-react';
import type { BookFile } from '@/reader-api';
import { useAddPdf } from '@/library/useAddPdf';
import { useLibrary } from '@/library/useLibrary';

/**
 * The floating Add PDF button. Hidden while the library is empty, where Home's
 * invitation is the one Add PDF control.
 */
export function AddPdfFab({ onOpen }: { onOpen: (file: BookFile) => void }): ReactElement | null {
  const { files, busy } = useLibrary();
  const handleAdd = useAddPdf(onOpen);

  if (files.length === 0) return null;
  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={busy}
      aria-label="Add PDF"
      className="group fixed right-6 bottom-6 z-10 flex h-14 w-14 cursor-pointer items-center justify-start overflow-hidden rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg outline-none transition-all duration-200 hover:w-36 hover:px-6 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-6 shrink-0 animate-spin" /> : <Plus className="size-6 shrink-0" />}
      <span className="absolute left-14 whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        {busy ? 'Adding…' : 'Add PDF'}
      </span>
    </button>
  );
}
