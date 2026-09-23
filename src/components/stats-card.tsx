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

  const stopped = stats.steppedUp + stats.denied;
  return (
    <section aria-label="Guard stats" className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 rounded-2xl bg-accent p-5 text-paper">
        <span className="font-mono text-xs opacity-80">
          Agent tool calls checked, so far
        </span>
        <span className="font-display text-6xl leading-none font-extrabold tabular-nums">
          {stats.total.toLocaleString()}
        </span>
        <div
          className="flex h-2 overflow-hidden rounded-full bg-paper/25"
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
        <dl className="grid grid-cols-3 gap-3 border-t border-paper/25 pt-3">
          {segments.map((s) => (
            <div key={s.key} className="flex flex-col">
              <dt className="text-xs opacity-80">{s.label}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums">
                {s.count}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          <span className="font-semibold">{stopped}</span> calls stopped or held
          before they ran.
        </p>
      </div>
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
