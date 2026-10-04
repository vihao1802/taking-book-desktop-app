import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Frame, LayoutGrid, ListTree, Maximize, Minimize, NotebookText, PanelLeft, TextWrap } from 'lucide-react';
import { clampZoomPercent } from '@taking-book/core';
import { Badge } from '@/components/ui/badge';
import { AdaptivePopover } from '@/components/AdaptivePopover';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useCapabilities } from '@/lib/useCapabilities';
import { cn } from '@/lib/utils';
import { FocusControls } from '@/focus/FocusControls';
import { ZoomControl } from './ZoomControl';
import type { SidebarTab } from './SidebarPanel';
import { withShortcutHint } from './shortcutHint';

/** Clamps a zoom multiplier (1 = 100%) into the supported range. */
/** A top-bar menu that opens over the page. */
type OverlayMenu = 'sidebar' | 'focus';

export function clampZoom(value: number): number {
  return clampZoomPercent(value * 100) / 100;
}

interface OverlayProps {
  visible: boolean;
  title: string;
  page: number;
  total: number;
  /** Page shown in the indicator text when it differs from the slider position (reflow). */
  indicatorPage?: number;
  /** Total shown in the indicator text when it differs from the slider range (reflow). */
  indicatorTotal?: number;
  mode: 'page' | 'reflow';
  zoom: number;
  fitWidth: boolean;
  fullScreen: boolean;
  /** When true, the reflow toggle is disabled because the document has no extractable text. */
  reflowDisabled?: boolean;
  onFitWidth: () => void;
  onToggleFullScreen: () => void;
  onZoomChange: (zoom: number) => void;
  onToggleMode: () => void;
  onClose: () => void;
  onSeek: (page: number) => void;
  /** Makes the page indicator clickable; opens the go-to-page popup. */
  onOpenGoTo?: () => void;
  /** Called when an interaction needs the parent to keep the overlay visible. */
  onInteract?: () => void;
  /** Called when a top-bar menu opens or closes, so the parent keeps the overlay up while one is open. */
  onMenuOpenChange?: (open: boolean) => void;
  /** Active sidebar tab; null means the sidebar is closed. */
  sidebarTab?: SidebarTab | null;
  onSelectSidebarTab?: (tab: SidebarTab | null) => void;
  /** When false the thumbnails entry is disabled (e.g. reflow has no page images). */
  sidebarThumbnailsEnabled?: boolean;
  /** Whether the Notes sidebar is open; drives the icon's pressed styling. */
  notesOpen?: boolean;
  /** Toggles the Notes sidebar; the icon is left out when this is not given. */
  onToggleNotes?: () => void;
}

export function Overlay({
  visible,
  title,
  page,
  total,
  indicatorPage = page,
  indicatorTotal = total,
  mode,
  zoom,
  fitWidth,
  fullScreen,
  reflowDisabled = false,
  onFitWidth,
  onToggleFullScreen,
  onZoomChange,
  onToggleMode,
  onClose,
  onSeek,
  onOpenGoTo,
  onInteract,
  onMenuOpenChange,
  sidebarTab = null,
  onSelectSidebarTab,
  sidebarThumbnailsEnabled = true,
  notesOpen = false,
  onToggleNotes,
}: OverlayProps) {
  // At most one top-bar menu is open: the sidebar menu or the Focus controls.
  const { fullScreen: canFullScreen } = useCapabilities();
  const [openMenu, setOpenMenu] = useState<OverlayMenu | null>(null);
  const sidebarMenuOpen = openMenu === 'sidebar';
  const closeMenu = () => setOpenMenu(null);

  // Escape closes the open menu before anything else. Capture phase plus
  // preventDefault tells the reader-wide shortcut handler it was consumed.
  useEffect(() => {
    if (openMenu === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpenMenu(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [openMenu]);

  const menuOpen = openMenu !== null;
  useEffect(() => {
    onMenuOpenChange?.(menuOpen);
  }, [menuOpen, onMenuOpenChange]);

  // A hidden overlay must not leave a menu open: the backdrop stays
  // clickable while invisible and would swallow the next page click.
  useEffect(() => {
    if (!visible) setOpenMenu(null);
  }, [visible]);

  const showMenu = (menu: OverlayMenu) => {
    setOpenMenu(menu);
    onInteract?.();
  };

  const chooseSidebarTab = (tab: SidebarTab) => {
    // Tapping the active entry closes the sidebar, mirroring the panel toggle.
    onSelectSidebarTab?.(tab === sidebarTab ? null : tab);
    closeMenu();
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10" onPointerDown={(e) => e.stopPropagation()}>
      {openMenu !== null && (
        <div
          className="pointer-events-auto absolute inset-0 z-10"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={closeMenu}
          aria-hidden
        />
      )}
      {/* While a menu is open the top bar sits above its own
          click-away backdrop. The bar's backdrop-blur traps the dropdown's
          z-30 in a local stacking context, so without this the transparent
          backdrop (z-10) covers the menu and swallows every click on it. */}
      <div className={cn('overlay overlay-top', !visible && 'overlay-hidden', openMenu !== null && 'z-20')}>
        {/* The controls wrap onto a second line at compact, where 48dp targets would not fit in one. */}
        <div className="bg-overlay text-foreground pointer-events-auto flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 py-2.5 backdrop-blur-md compact:gap-x-1 compact:px-2">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          {onSelectSidebarTab && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (sidebarMenuOpen ? closeMenu() : showMenu('sidebar'))}
                aria-label="Thumbnails and outlines"
                aria-haspopup="menu"
                aria-expanded={sidebarMenuOpen}
                title={`${withShortcutHint('Thumbnails', 'toggleThumbnails')}, ${withShortcutHint('Outlines', 'toggleOutline')}`}
                className={cn(sidebarTab !== null && 'bg-accent text-accent-foreground')}
              >
                <PanelLeft className="size-4" />
              </Button>
              {sidebarMenuOpen && (
                <AdaptivePopover
                  role="menu"
                  label="Sidebar views"
                  onClose={closeMenu}
                  anchoredClassName="top-full left-0 mt-1.5 w-44 p-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!sidebarThumbnailsEnabled}
                    onClick={() => chooseSidebarTab('thumbnails')}
                    className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    <LayoutGrid className="size-4" />
                    Thumbnails
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => chooseSidebarTab('outlines')}
                    className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <ListTree className="size-4" />
                    Outlines
                  </button>
                </AdaptivePopover>
              )}
            </div>
          )}
          <span className="min-w-24 flex-1 truncate text-sm font-medium">{title}</span>
          {mode === 'reflow' && <Badge variant="secondary">Reflow</Badge>}
          {mode === 'page' && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(fitWidth && 'bg-accent text-accent-foreground')}
              onClick={onFitWidth}
              aria-label="Fit to width"
              title={withShortcutHint('Fit to width', 'zoomFit')}
            >
              <Frame className="size-4" />
            </Button>
          )}
          <ZoomControl zoom={zoom} onZoomChange={onZoomChange} onInteract={onInteract} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMode}
            disabled={reflowDisabled}
            aria-label="Toggle reflow"
            aria-pressed={mode === 'reflow'}
            title={
              reflowDisabled
                ? 'This book is image-based and has no extractable text'
                : withShortcutHint(
                    mode === 'reflow' ? 'Page view' : 'Reflow (continuous text)',
                    'toggleReflow',
                  )
            }
          >
            {mode === 'reflow' ? <FileText className="size-4" /> : <TextWrap className="size-4" />}
          </Button>
          <FocusControls
            open={openMenu === 'focus'}
            onOpenChange={(open) => (open ? showMenu('focus') : closeMenu())}
          />
          {onToggleNotes && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(notesOpen && 'bg-accent text-accent-foreground')}
              onClick={onToggleNotes}
              aria-label="Notes"
              aria-pressed={notesOpen}
              title={withShortcutHint('Notes', 'toggleNotes')}
            >
              <NotebookText className="size-4" />
            </Button>
          )}
          {canFullScreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFullScreen}
              aria-label={fullScreen ? 'Exit full screen' : 'Full screen'}
              aria-pressed={fullScreen}
              title={fullScreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullScreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
            </Button>
          )}
        </div>
      </div>
      <div className={cn('overlay overlay-bottom', !visible && 'overlay-hidden')}>
        <div className="bg-overlay text-foreground pointer-events-auto flex items-center gap-4 px-4 py-2.5 backdrop-blur-md">
          <Slider
            min={1}
            max={Math.max(total, 1)}
            value={[page]}
            onValueChange={([value]) => onSeek(value)}
            aria-label="Position"
            className="flex-1"
          />
          {onOpenGoTo ? (
            <button
              type="button"
              onClick={onOpenGoTo}
              aria-label="Go to page"
              aria-haspopup="dialog"
              title={withShortcutHint('Go to page', 'goToPage')}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 min-w-[5.5ch] shrink-0 cursor-pointer rounded-sm text-right text-sm tabular-nums outline-none focus-visible:ring-2"
            >
              {indicatorPage} / {indicatorTotal}
            </button>
          ) : (
            <span className="text-muted-foreground min-w-[5.5ch] shrink-0 text-right text-sm tabular-nums">
              {indicatorPage} / {indicatorTotal}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}