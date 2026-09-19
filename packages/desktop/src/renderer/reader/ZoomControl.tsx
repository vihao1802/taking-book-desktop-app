import { useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import {
  ZOOM_PRESETS,
  multiplierToPercent,
  nextPresetPercent,
  parseCustomZoomPercent,
  percentToMultiplier,
  previousPresetPercent,
} from '@taking-book/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { withShortcutHint } from './shortcutHint';

interface ZoomControlProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Called when an interaction needs the parent to keep the overlay visible. */
  onInteract?: () => void;
}

/**
 * Zoom controls for the reader overlay: `−`/`+` snap to the nearest preset, the
 * percentage opens a dropdown of presets plus a custom entry, and the custom
 * entry accepts a whole percentage in [50, 200].
 */
export function ZoomControl({ zoom, onZoomChange, onInteract }: ZoomControlProps) {
  const percent = multiplierToPercent(zoom);
  const isPreset = ZOOM_PRESETS.includes(percent);
  const prev = previousPresetPercent(percent);
  const next = nextPresetPercent(percent);
  const [editingCustom, setEditingCustom] = useState(false);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  // The select restores focus to its (now unmounted) trigger on close, which
  // blurs the replacement input immediately. Ignore that first blur so the
  // field stays open for the user; a real click-away comes later.
  const mountedAtRef = useRef(0);

  const startCustom = () => {
    setDraft(String(percent));
    mountedAtRef.current = Date.now();
    setEditingCustom(true);
  };

  const applyDraft = () => {
    const value = parseCustomZoomPercent(draft);
    if (value === null) {
      setInvalid(true);
      return false;
    }
    onZoomChange(percentToMultiplier(value));
    setEditingCustom(false);
    setInvalid(false);
    return true;
  };

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        disabled={prev === null}
        onClick={() => {
          if (prev !== null) onZoomChange(percentToMultiplier(prev));
        }}
        aria-label="Zoom out"
        title={withShortcutHint('Zoom out', 'zoomOut')}
      >
        <ZoomOut className="size-4" />
      </Button>
      {editingCustom ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyDraft();
            else if (e.key === 'Escape') {
              // Cancelling the field must not also count as leaving the reader.
              e.stopPropagation();
              setEditingCustom(false);
            }
          }}
          // Losing focus discards the draft; Enter is the only way to commit.
          // The very first blur (the select handing focus back to its trigger)
          // is ignored so the field doesn't close on open.
          onBlur={() => {
            if (Date.now() - mountedAtRef.current < 250) return;
            setEditingCustom(false);
          }}
          aria-label="Custom zoom percentage"
          className={cn(
            'h-8 w-16 text-center text-xs tabular-nums',
            invalid && 'border-destructive',
          )}
        />
      ) : (
        <Select
          value={isPreset ? String(percent) : 'custom'}
          onOpenChange={(open) => {
            if (open) onInteract?.();
          }}
          onValueChange={(value) => {
            if (value === 'custom') startCustom();
            else onZoomChange(percentToMultiplier(Number(value)));
          }}
        >
          <SelectTrigger className="h-8 w-16 px-1 text-xs" aria-label="Zoom">
            <SelectValue>{percent}%</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ZOOM_PRESETS.map((preset) => (
              <SelectItem key={preset} value={String(preset)}>
                {preset}%
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom…</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Button
        variant="ghost"
        size="icon"
        disabled={next === null}
        onClick={() => {
          if (next !== null) onZoomChange(percentToMultiplier(next));
        }}
        aria-label="Zoom in"
        title={withShortcutHint('Zoom in', 'zoomIn')}
      >
        <ZoomIn className="size-4" />
      </Button>
    </div>
  );
}