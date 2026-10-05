'use client';

import { useId, memo } from 'react';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

/**
 * Tiny inline SVG sparkline (no recharts) for stock list + screener rows.
 * Color: emerald when the series ends above its start, rose otherwise.
 */
function SparklineImpl({ values, width = 64, height = 24, positive }: SparklineProps) {
  // Unique gradient id per instance — several sparklines can share a page.
  const uid = useId();
  const pts = values.length >= 2 ? values.slice(-40) : [];
  if (pts.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="shrink-0"
        aria-hidden="true"
      >
        <line
          x1="2"
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="#52525b"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  let min = Infinity;
  let max = -Infinity;
  for (const v of pts) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || max * 0.001 || 1;
  const stepX = (width - 4) / (pts.length - 1);
  const y = (v: number) => 2 + (1 - (v - min) / span) * (height - 4);

  const path = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(2 + i * stepX).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');

  const up = positive ?? pts[pts.length - 1] >= pts[0];
  const stroke = up ? '#34d399' : '#fb7185';
  const fillId = `spark-${uid}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${(2 + (pts.length - 1) * stepX).toFixed(1)},${height - 1} L2,${height - 1} Z`}
        fill={`url(#${fillId})`}
        stroke="none"
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export const Sparkline = memo(SparklineImpl);
