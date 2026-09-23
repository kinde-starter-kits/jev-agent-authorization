'use client';

import {useState} from 'react';
import {ARM_META, ARM_ORDER, type ArmKey} from '@/lib/bench';

type Props = {
  title: string;
  note: string;
  values: Record<ArmKey, number>;
  format: (value: number) => string;
  /** Upper end of the axis. Defaults to the largest value. */
  max?: number;
  lowerIsBetter?: boolean;
};

export function MetricBars({
  title,
  note,
  values,
  format,
  max,
  lowerIsBetter = false
}: Props) {
  const [hover, setHover] = useState<ArmKey | null>(null);
  const top = max ?? Math.max(...ARM_ORDER.map((arm) => values[arm]), 1e-9);

  return (
    <figure className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <figcaption className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-xs text-muted">
          {note} {lowerIsBetter ? 'Lower is better.' : 'Higher is better.'}
        </span>
      </figcaption>
      <ul className="flex flex-col gap-2">
        {ARM_ORDER.map((arm) => {
          const value = values[arm];
          const width = top > 0 ? Math.max((value / top) * 100, 0) : 0;
          return (
            <li
              key={arm}
              className="grid grid-cols-[9.5rem_1fr_4.5rem] items-center gap-3 text-sm"
              onMouseEnter={() => setHover(arm)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="flex items-center gap-2 truncate text-muted">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm ${ARM_META[arm].swatch}`}
                />
                {ARM_META[arm].label}
              </span>
              <span className="relative h-3 rounded-r bg-track">
                <span
                  className={`absolute inset-y-0 left-0 rounded-r ${ARM_META[arm].swatch} transition-opacity ${
                    hover && hover !== arm ? 'opacity-40' : ''
                  }`}
                  style={{width: `${width}%`, minWidth: value > 0 ? 3 : 0}}
                />
              </span>
              <span className="text-right font-mono tabular-nums">
                {format(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
