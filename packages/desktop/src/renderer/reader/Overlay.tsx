import { ArrowLeft, Frame, Type } from 'lucide-react';
import { clampZoomPercent } from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ZoomControl } from './ZoomControl';

/** Clamps a zoom multiplier (1 = 100%) into the supported range. */
export function clampZoom(value: number): number {
  return clampZoomPercent(value * 100) / 100;
}

interface OverlayProps {
  visible: boolean;
  title: string;
  page: number;
  total: number;
  mode: 'page' | 'reflow';
  zoom: number;
  fitWidth: boolean;
  /** When true, the reflow toggle is disabled because the document has no extractable text. */
  reflowDisabled?: boolean;
  onFitWidth: () => void;
  onZoomChange: (zoom: number) => void;
  onToggleMode: () => void;
  onClose: () => void;
  onSeek: (page: number) => void;
  /** Called when an interaction needs the parent to keep the overlay visible. */
  onInteract?: () => void;
}

export function Overlay({
  visible,
  title,
  page,
  total,
  mode,
  zoom,
  fitWidth,
  reflowDisabled = false,
  onFitWidth,
  onZoomChange,
  onToggleMode,
  onClose,
  onSeek,
  onInteract,
}: OverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" onPointerDown={(e) => e.stopPropagation()}>
      <div className={cn('overlay overlay-top', !visible && 'overlay-hidden')}>
        <div className="bg-overlay text-foreground pointer-events-auto flex items-center gap-3.5 px-4 py-2.5 backdrop-blur-md">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          {mode === 'page' && (
            <Button
              variant="ghost"
              className={cn(
                'px-2.5',
                fitWidth && 'bg-accent text-accent-foreground',
              )}
              onClick={onFitWidth}
              aria-label="Fit to width"
              title="Fit to width"
            >
              <Frame className="size-4" />
              <span>Fit</span>
            </Button>
          )}
          <ZoomControl zoom={zoom} onZoomChange={onZoomChange} onInteract={onInteract} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMode}
            disabled={reflowDisabled}
            aria-label="Toggle reflow"
            title={
              reflowDisabled
                ? 'This book is image-based and has no extractable text'
                : mode === 'reflow'
                  ? 'Page view'
                  : 'Reflow (continuous text)'
            }
          >
            <Type className="size-4" />
          </Button>
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
          <span className="text-muted-foreground min-w-[5.5ch] shrink-0 text-right text-sm tabular-nums">
            {page} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}