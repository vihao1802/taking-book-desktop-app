import { ArrowLeft, Frame, SunMoon, Type, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

/** Clamps a zoom value into the supported range. */
export function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

interface OverlayProps {
  visible: boolean;
  title: string;
  page: number;
  total: number;
  mode: 'page' | 'reflow';
  zoom: number;
  fitWidth: boolean;
  onFitWidth: () => void;
  onZoomChange: (zoom: number) => void;
  onToggleMode: () => void;
  onClose: () => void;
  onSeek: (page: number) => void;
  onCycleTheme: () => void;
}

export function Overlay({
  visible,
  title,
  page,
  total,
  mode,
  zoom,
  fitWidth,
  onFitWidth,
  onZoomChange,
  onToggleMode,
  onClose,
  onSeek,
  onCycleTheme,
}: OverlayProps) {
  const clamp = (value: number) => clampZoom(value);

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
              size="icon"
              className={cn(fitWidth && 'bg-accent text-accent-foreground')}
              onClick={onFitWidth}
              aria-label="Fit to container width"
              title="Fit to container width"
            >
              <Frame className="size-4" />
            </Button>
          )}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onZoomChange(clamp(zoom - ZOOM_STEP))}
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </Button>
            <button
              type="button"
              className="text-muted-foreground w-10 cursor-pointer text-xs tabular-nums"
              onClick={() => onZoomChange(1)}
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onZoomChange(clamp(zoom + ZOOM_STEP))}
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMode}
            aria-label="Toggle reflow"
            title={mode === 'reflow' ? 'Page view' : 'Reflow (continuous text)'}
          >
            <Type className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onCycleTheme} aria-label="Theme">
            <SunMoon className="size-4" />
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