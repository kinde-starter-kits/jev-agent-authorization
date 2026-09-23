'use client';

import {useQuery} from 'convex/react';
import {api} from '../../convex/_generated/api';
import {formatUsd} from '@/lib/labels';

function Tile({
  label,
  value,
  note
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-card p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-xl font-semibold tabular-nums">
        {value}
      </span>
      {note && <span className="text-xs text-faint">{note}</span>}
    </div>
  );
}

export function StatsCard() {
  const stats = useQuery(api.wall.stats, {});
  if (stats === undefined) {
    return <div className="h-52 animate-pulse rounded-2xl bg-track" />;
  }

  const total = Math.max(stats.total, 1);
  const segments = [
    {key: 'allow', label: 'Allowed', count: stats.allowed, bar: 'bg-allow'},
    {
      key: 'step_up',
      label: 'Step-up',
      count: stats.steppedUp,
      bar: 'bg-stepup'
    },
    {key: 'deny', label: 'Denied', count: stats.denied, bar: 'bg-deny'}
  ];
  const latency =
    stats.jevP50Ms === null
      ? '—'
      : `${Math.round(stats.jevP50Ms)} / ${Math.round(stats.jevP95Ms ?? stats.jevP50Ms)} ms`;

  return (
    <section
      aria-label="Guard stats"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm text-muted">Tool calls checked</span>
          <span className="font-mono text-4xl font-semibold tabular-nums">
            {stats.total.toLocaleString()}
          </span>
        </div>
        <span className="text-right text-xs text-faint">
          Every authenticated call,
          <br />
          before it runs
        </span>
      </div>

      <div
        className="flex h-2 overflow-hidden rounded-full bg-track"
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.count}`).join(', ')}
      >
        {segments.map((s) => (
          <span
            key={s.key}
            className={s.bar}
            style={{width: `${(s.count / total) * 100}%`}}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${s.bar}`} />
            <span className="text-muted">{s.label}</span>
            <span className="font-mono tabular-nums">{s.count}</span>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="Calls Jev judged"
          value={stats.judged.toLocaleString()}
          note="Reads with a permission skip Jev"
        />
        <Tile
          label="Jev latency p50 / p95"
          value={latency}
          note="Last 200 calls"
        />
        <Tile label="Jev spend" value={formatUsd(stats.jevCostUsd)} />
        <Tile
          label="Same calls with an LLM judge"
          value={
            stats.llmEquivalentUsd === null
              ? '—'
              : formatUsd(stats.llmEquivalentUsd)
          }
          note={
            stats.llmEquivalentUsd === null
              ? 'Measured after the first judge call'
              : `Measured from ${stats.judgeCalls} judge calls`
          }
        />
      </div>
    </section>
  );
}
