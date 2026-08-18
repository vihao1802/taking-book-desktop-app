import { useMemo } from 'react';

const WIDTH = 640;
const HEIGHT = 220;
const PAD = 10;

interface AreaChartProps {
  data: Array<{ day: string; minutes: number }>;
  ariaLabel: string;
}

/**
 * Minimal SVG area chart of reading minutes per day, styled like a market
 * trend line: a gradient-filled area under a smooth series, with a horizontal
 * baseline at zero. All colors come from theme tokens so it adapts to themes.
 */
export function AreaChart({ data, ariaLabel }: AreaChartProps) {
  const view = useMemo(() => {
    const max = Math.max(...data.map((d) => d.minutes), 1);
    const plotW = WIDTH - PAD * 2;
    const plotH = HEIGHT - PAD * 2;
    const xFor = (i: number): number =>
      data.length <= 1 ? PAD : PAD + (i / (data.length - 1)) * plotW;
    const yFor = (minutes: number): number => PAD + plotH - (minutes / max) * plotH;
    const points = data.map((d, i) => [xFor(i), yFor(d.minutes)] as const);
    return { max, points };
  }, [data]);

  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No reading data yet.</p>;
  }

  const linePath = view.points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${WIDTH - PAD} ${HEIGHT - PAD} L ${PAD} ${HEIGHT - PAD} Z`;
  const lastX = view.points[view.points.length - 1][0];
  const lastY = view.points[view.points.length - 1][1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line
        x1={PAD}
        y1={HEIGHT - PAD}
        x2={WIDTH - PAD}
        y2={HEIGHT - PAD}
        className="stroke-border"
        strokeWidth="1"
      />
      <path d={areaPath} fill="url(#area-fill)" />
      <path d={linePath} className="text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4" className="text-primary" fill="currentColor" />
    </svg>
  );
}