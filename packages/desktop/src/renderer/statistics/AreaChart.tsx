import { useMemo, useState } from 'react';
import { clampTooltipX, computeXAxisTicks, computeYAxisTicks, formatDay, formatMinutes } from './chartAxes';
import type { YAxisTick } from './chartAxes';

const WIDTH = 640;
const HEIGHT = 220;
const PAD_TOP = 10;
const PAD_RIGHT = 10;
const PAD_BOTTOM = 20;
const PAD_LEFT = 34;

const TICK_FONT_SIZE = 9;
const Y_LABEL_GAP = 6;
const X_LABEL_OFFSET = 4;
const HIT_RADIUS = 10;
const POINT_RADIUS = 4;
const TOOLTIP_WIDTH = 92;
const TOOLTIP_HEIGHT = 28;
const TOOLTIP_DATE_Y = 11;
const TOOLTIP_VALUE_Y = 22;

type Point = readonly [number, number];
type DayMinutes = { day: string; minutes: number };

interface AreaChartProps {
  data: DayMinutes[];
  ariaLabel: string;
}

/**
 * Minimal SVG area chart of reading minutes per day, styled like a market
 * trend line: a gradient-filled area under a smooth series, with a labeled
 * X axis (date) and Y axis (reading time), plus a hover tooltip. All colors
 * come from theme tokens so it adapts to themes.
 */
export function AreaChart({ data, ariaLabel }: AreaChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const view = useMemo(() => {
    const rawMax = Math.max(...data.map((d) => d.minutes), 0);
    const yTicks = computeYAxisTicks(rawMax);
    const max = yTicks[yTicks.length - 1].value;
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const xFor = (i: number): number =>
      data.length <= 1 ? PAD_LEFT : PAD_LEFT + (i / (data.length - 1)) * plotW;
    const yFor = (minutes: number): number => PAD_TOP + plotH - (minutes / max) * plotH;
    const points: Point[] = data.map((d, i) => [xFor(i), yFor(d.minutes)] as const);
    const xTicks = computeXAxisTicks(data);
    return { yTicks, plotH, xFor, yFor, points, xTicks };
  }, [data]);

  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No reading data yet.</p>;
  }

  const baselineY = PAD_TOP + view.plotH;
  const linePath = view.points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${WIDTH - PAD_RIGHT} ${baselineY} L ${PAD_LEFT} ${baselineY} Z`;
  const lastPoint = view.points[view.points.length - 1];
  const hovered =
    hoveredIndex === null ? null : { point: view.points[hoveredIndex], datum: data[hoveredIndex] };

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      onPointerLeave={() => setHoveredIndex(null)}
    >
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <YAxisGridlines ticks={view.yTicks} xLeft={PAD_LEFT} xRight={WIDTH - PAD_RIGHT} yFor={view.yFor} />
      <XAxisLabels data={data} ticks={view.xTicks} xFor={view.xFor} />

      <path d={areaPath} fill="url(#area-fill)" />
      <path d={linePath} className="text-primary" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r={POINT_RADIUS} className="text-primary" fill="currentColor" />

      <HoverTargets points={view.points} onHover={setHoveredIndex} />

      {hovered && (
        <ChartTooltip
          point={hovered.point}
          datum={hovered.datum}
          plotLeft={PAD_LEFT}
          plotRight={WIDTH - PAD_RIGHT}
          plotTop={PAD_TOP}
          baselineY={baselineY}
        />
      )}
    </svg>
  );
}

function YAxisGridlines({
  ticks,
  xLeft,
  xRight,
  yFor,
}: {
  ticks: YAxisTick[];
  xLeft: number;
  xRight: number;
  yFor: (minutes: number) => number;
}) {
  return (
    <>
      {ticks.map((tick) => {
        const y = yFor(tick.value);
        return (
          <g key={tick.value}>
            <line x1={xLeft} y1={y} x2={xRight} y2={y} className="stroke-border" strokeWidth="1" />
            <text
              x={xLeft - Y_LABEL_GAP}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-muted-foreground"
              fill="currentColor"
              fontSize={TICK_FONT_SIZE}
            >
              {tick.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

function XAxisLabels({
  data,
  ticks,
  xFor,
}: {
  data: DayMinutes[];
  ticks: number[];
  xFor: (i: number) => number;
}) {
  return (
    <>
      {ticks.map((i) => (
        <text
          key={i}
          x={xFor(i)}
          y={HEIGHT - X_LABEL_OFFSET}
          textAnchor="middle"
          className="text-muted-foreground"
          fill="currentColor"
          fontSize={TICK_FONT_SIZE}
        >
          {formatDay(data[i].day)}
        </text>
      ))}
    </>
  );
}

function HoverTargets({ points, onHover }: { points: Point[]; onHover: (i: number) => void }) {
  return (
    <>
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={HIT_RADIUS} fill="transparent" onPointerEnter={() => onHover(i)} />
      ))}
    </>
  );
}

function ChartTooltip({
  point,
  datum,
  plotLeft,
  plotRight,
  plotTop,
  baselineY,
}: {
  point: Point;
  datum: DayMinutes;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  baselineY: number;
}) {
  const x = clampTooltipX(point[0], TOOLTIP_WIDTH, plotLeft, plotRight);
  return (
    <>
      <line
        x1={point[0]}
        y1={plotTop}
        x2={point[0]}
        y2={baselineY}
        className="stroke-border"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <circle cx={point[0]} cy={point[1]} r={POINT_RADIUS} className="text-primary" fill="currentColor" />
      <rect
        x={x}
        y={plotTop}
        width={TOOLTIP_WIDTH}
        height={TOOLTIP_HEIGHT}
        rx="4"
        className="fill-popover stroke-border"
        strokeWidth="1"
      />
      <text
        x={x + TOOLTIP_WIDTH / 2}
        y={plotTop + TOOLTIP_DATE_Y}
        textAnchor="middle"
        className="text-popover-foreground"
        fill="currentColor"
        fontSize={TICK_FONT_SIZE}
      >
        {formatDay(datum.day)}
      </text>
      <text
        x={x + TOOLTIP_WIDTH / 2}
        y={plotTop + TOOLTIP_VALUE_Y}
        textAnchor="middle"
        className="text-popover-foreground"
        fill="currentColor"
        fontSize={TICK_FONT_SIZE}
        fontWeight="600"
      >
        {formatMinutes(datum.minutes)}
      </text>
    </>
  );
}
