'use client';

import {useQuery} from 'convex/react';
import Link from 'next/link';
import {api} from '../../convex/_generated/api';
import {DecisionCard} from './decision-card';

export function LedgerWall() {
  const decisions = useQuery(api.wall.recent, {});

  return (
    <section aria-labelledby="ledger-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 id="ledger-title" className="text-lg font-semibold">
          Live ledger
        </h2>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="h-2 w-2 animate-pulse rounded-full bg-allow" />
          Updates live
        </span>
      </div>

      {decisions === undefined ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-40 animate-pulse rounded-xl bg-track" />
          ))}
        </div>
      ) : decisions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
          No tool calls yet.{' '}
          <Link href="/console" className="text-accent underline">
            Run the agent
          </Link>{' '}
          to see the first decision.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {decisions.map((decision) => (
            <li key={decision.id}>
              <DecisionCard decision={decision} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
