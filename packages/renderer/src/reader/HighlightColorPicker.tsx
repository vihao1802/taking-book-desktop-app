import { cn } from '@/lib/utils';
import type { AnnotationColor } from '@/reader-api';
import { HIGHLIGHT_COLORS, HIGHLIGHT_FILL } from './highlights';

interface HighlightColorPickerProps {
  value: AnnotationColor;
  onChange: (color: AnnotationColor) => void;
  disabled?: boolean;
}

/** The four highlight color swatches of a Note card, as a radio group. */
export function HighlightColorPicker({ value, onChange, disabled = false }: HighlightColorPickerProps) {
  return (
    <div role="radiogroup" aria-label="Highlight color" className="flex items-center gap-1.5">
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          title={color}
          disabled={disabled}
          onClick={() => onChange(color)}
          className={cn(
            'size-5 cursor-pointer rounded-full border border-black/20 transition-transform hover:scale-110 disabled:cursor-default',
            value === color && 'ring-foreground ring-2 ring-offset-1',
          )}
          style={{ backgroundColor: HIGHLIGHT_FILL[color] }}
        />
      ))}
    </div>
  );
}
