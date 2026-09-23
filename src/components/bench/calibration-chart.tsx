'use client';

import {useState} from 'react';
import {pct} from '@/lib/bench';

type Point = {
  low: number;
  high: number;
  n: number;
  predicted: number;
  observed: number;
};

const SIZE = 280;
const PAD = 44;
const INNER = SIZE - PAD * 2;

const x = (value: number) => PAD + value * INNER;
const y = (value: number) => SIZE - PAD - value * INNER;

export function CalibrationChart({
  title,
  points,
  ece,
  n
}: {
  title: string;
  points: Point[];
  ece: number;
  n: number;
}) {
  const [hover, setHover] = useState<Point | null>(null);
  const maxN = Math.max(...points.map((p) => p.n), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <figcaption className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-xs text-muted">
          Each dot is a group of calls with a similar Jev probability. On the
          dashed line, the probability matches how often it was true. Dot size
          shows the number of calls. Calibration error {pct(ece)} · n {n}.
        </span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full max-w-sm"
          role="img"
          aria-label={`${title}. Calibration error ${pct(ece)}.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(0)}
                x2={x(1)}
                y1={y(t)}
                y2={y(t)}
                className="stroke-line"
                strokeWidth={1}
              />
              <text
                x={PAD - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="fill-faint text-[9px]"
              >
                {t * 100}%
              </text>
              <text
                x={x(t)}
                y={SIZE - PAD + 14}
                textAnchor="middle"
                className="fill-faint text-[9px]"
              >
                {t * 100}%
              </text>
            </g>
          ))}
          <line
            x1={x(0)}
            y1={y(0)}
            x2={x(1)}
            y2={y(1)}
            className="stroke-faint"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <polyline
            fill="none"
            className="stroke-series-1"
            strokeWidth={2}
            points={points
              .map((p) => `${x(p.predicted)},${y(p.observed)}`)
              .join(' ')}
          />
          {points.map((p) => (
            <g
              key={p.low}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
            >
              <circle
                cx={x(p.predicted)}
                cy={y(p.observed)}
                r={14}
                fill="transparent"
              />
              <circle
                cx={x(p.predicted)}
                cy={y(p.observed)}
                r={4 + 6 * Math.sqrt(p.n / maxN)}
                className="fill-series-1 stroke-card"
                strokeWidth={2}
              />
            </g>
          ))}
          <text
            x={x(0.5)}
            y={SIZE - 4}
            textAnchor="middle"
            className="fill-muted text-[10px]"
          >
            Jev probability
          </text>
          <text
            x={9}
            y={y(0.5)}
            textAnchor="middle"
            transform={`rotate(-90 9 ${y(0.5)})`}
            className="fill-muted text-[10px]"
          >
            Share that was true
          </text>
        </svg>
        {hover && (
          <div className="pointer-events-none absolute top-2 right-2 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-xs shadow-sm">
            <div>
              Jev said {pct(hover.low, 0)}–{pct(hover.high, 0)}
            </div>
            <div>mean {pct(hover.predicted)}</div>
            <div>true {pct(hover.observed)}</div>
            <div className="text-faint">{hover.n} calls</div>
          </div>
        )}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">Show as a table</summary>
        <table className="mt-2 w-full font-mono tabular-nums">
          <thead className="text-left text-faint">
            <tr>
              <th className="font-normal">Bin</th>
              <th className="font-normal">Calls</th>
              <th className="font-normal">Jev mean</th>
              <th className="font-normal">True</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.low}>
                <td>
                  {pct(p.low, 0)}–{pct(p.high, 0)}
                </td>
                <td>{p.n}</td>
                <td>{pct(p.predicted)}</td>
                <td>{pct(p.observed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
