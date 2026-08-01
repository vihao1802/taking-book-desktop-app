interface OverlayProps {
  visible: boolean;
  title: string;
  page: number;
  total: number;
  mode: 'page' | 'reflow';
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
  onToggleMode,
  onClose,
  onSeek,
  onCycleTheme,
}: OverlayProps) {
  return (
    <div className="overlay-root" onPointerDown={(e) => e.stopPropagation()}>
      <div className={`overlay overlay-top${visible ? '' : ' overlay-hidden'}`}>
        <div className="bar">
          <button className="icon-btn" onClick={onClose} aria-label="Back">
            ‹
          </button>
          <span className="bar-title">{title}</span>
          <button
            className="icon-btn bar-spacer"
            onClick={onToggleMode}
            aria-label="Toggle reflow"
            title={mode === 'reflow' ? 'Page view' : 'Reflow (continuous text)'}
          >
            {mode === 'reflow' ? '¶' : 'Aa'}
          </button>
          <button className="icon-btn" onClick={onCycleTheme} aria-label="Theme">
            T
          </button>
        </div>
      </div>
      <div className={`overlay overlay-bottom${visible ? '' : ' overlay-hidden'}`}>
        <div className="bar">
          <input
            className="page-slider"
            type="range"
            min={1}
            max={Math.max(total, 1)}
            value={page}
            onChange={(e) => onSeek(Number(e.target.value))}
            aria-label="Position"
          />
          <span className="bar-page">
            {page} / {total}
          </span>
        </div>
      </div>
    </div>
  );
}
