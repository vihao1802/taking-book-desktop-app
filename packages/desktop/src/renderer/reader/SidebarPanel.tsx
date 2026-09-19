import { useEffect, useRef, type ReactNode } from 'react';
import { LayoutGrid, ListTree, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Which sidebar tab is visible; null means the sidebar is closed. */
export type SidebarTab = 'thumbnails' | 'outlines';

interface SidebarPanelProps {
  tab: Exclude<SidebarTab, never>;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  /** When false the thumbnails tab is hidden (e.g. reflow mode has no page images). */
  showThumbnails: boolean;
  children: ReactNode;
}

const TAB_LABEL: Record<SidebarTab, string> = {
  thumbnails: 'Thumbnails',
  outlines: 'Outlines',
};

/**
 * Floating left panel hosting the thumbnails / outlines views. It overlays
 * the page content instead of shrinking it, so the page layout math stays
 * untouched; all pointer events are stopped so clicks here never toggle the
 * reader overlay.
 */
export function SidebarPanel({ tab, onTabChange, onClose, showThumbnails, children }: SidebarPanelProps) {
  const asideRef = useRef<HTMLElement>(null);

  // Clicking outside the panel closes it. The overlay's own bars stop
  // pointerdown propagation, so interacting with them never reaches here and
  // the sidebar stays open; a click on the document itself closes it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (asideRef.current && !asideRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  return (
    <aside
      ref={asideRef}
      aria-label={TAB_LABEL[tab]}
      className="bg-overlay text-foreground pointer-events-auto absolute top-16 bottom-16 left-2 z-[5] flex w-60 flex-col overflow-hidden rounded-lg shadow-lg backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
        {showThumbnails && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTabChange('thumbnails')}
            aria-pressed={tab === 'thumbnails'}
            className={cn('h-7 gap-1.5 px-2 text-xs', tab === 'thumbnails' && 'bg-accent text-accent-foreground')}
          >
            <LayoutGrid className="size-3.5" />
            Thumbnails
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTabChange('outlines')}
          aria-pressed={tab === 'outlines'}
          className={cn('h-7 gap-1.5 px-2 text-xs', tab === 'outlines' && 'bg-accent text-accent-foreground')}
        >
          <ListTree className="size-3.5" />
          Outlines
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close sidebar" className="size-7">
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
