'use client';

import {useQuery} from 'convex/react';
import type {FunctionReturnType} from 'convex/server';
import {api} from '../../convex/_generated/api';
import type {Id} from '../../convex/_generated/dataModel';
import {SignalBar} from './decision-card';
import {
  formatUsd,
  reasonLabel,
  STATUS_LABEL,
  VERDICT_CLASS,
  VERDICT_LABEL
} from '@/lib/labels';

export type Run = FunctionReturnType<typeof api.runs.mine>[number];

export const RUN_STATUS: Record<Run['status'], string> = {
  running: 'Running',
  done: 'Done',
  held: 'Waiting for your approval',
  refused: 'Stopped by the guard',
  failed: 'Failed'
};

const RUN_STATUS_CLASS: Record<Run['status'], string> = {
  running: 'text-muted',
  done: 'text-allow',
  held: 'text-stepup',
  refused: 'text-deny',
  failed: 'text-deny'
};

function argsSummary(argsJson: string | null) {
  if (!argsJson) return null;
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(args)) {
      if (key === 'body' || key === 'query') {
        const inner = JSON.parse(String(value)) as Record<string, unknown>;
        for (const [k, v] of Object.entries(inner)) {
          if (k !== 'reason') parts.push(`${k} ${String(v)}`);
        }
      } else {
        parts.push(`${key} ${String(value)}`);
      }
    }
    return parts.join(' · ') || null;
  } catch {
    return null;
  }
}

function Steps({runId}: {runId: Id<'runs'>}) {
  const steps = useQuery(api.runs.steps, {runId});
  if (steps === undefined)
    return <div className="h-16 animate-pulse rounded-xl bg-track" />;
  if (steps === null) return null;

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step) =>
        step.kind === 'assistant' ? (
          <li
            key={step.id}
            className="text-sm leading-relaxed whitespace-pre-wrap"
          >
            {step.text}
          </li>
        ) : (
          <li
            key={step.id}
            className="ledger-in flex flex-col gap-2 rounded-xl border border-line bg-card p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">
                {step.tool}
              </span>
              {step.decision && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASS[step.decision.verdict]}`}
                >
                  {VERDICT_LABEL[step.decision.verdict]}
                </span>
              )}
              {step.decision && (
                <span className="text-sm">
                  {reasonLabel(step.decision.reasonCode)}
                </span>
              )}
              {step.decision?.intentSource === 'verified' && (
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                  Intent verified
                </span>
              )}
              {!step.decision && step.code && (
                <span className="font-mono text-xs text-muted">
                  {step.code}
                </span>
              )}
            </div>
            {argsSummary(step.argsJson) && (
              <p className="font-mono text-xs break-all text-muted">
                {argsSummary(step.argsJson)}
              </p>
            )}
            {step.decision?.jev && (
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-6">
                <SignalBar
                  label="Matches the request"
                  value={step.decision.jev.matchesIntent}
                  good
                />
                <SignalBar
                  label="Destructive"
                  value={step.decision.jev.destructive}
                />
                <SignalBar
                  label="Follows injected text"
                  value={step.decision.jev.injected}
                />
                <SignalBar
                  label="Sends data out"
                  value={step.decision.jev.exfiltration}
                />
              </div>
            )}
            {step.decision && (
              <p className="font-mono text-xs text-faint tabular-nums">
                {STATUS_LABEL[step.decision.status] ?? step.decision.status} ·
                guard {Math.round(step.decision.guardMs)} ms
                {step.decision.jev &&
                  ` · Jev ${Math.round(step.decision.jev.ms)} ms · ${formatUsd(step.decision.jev.costUsd ?? 0)}`}
              </p>
            )}
            {step.approvalUrl && (
              <a
                href={step.approvalUrl}
                className="w-fit rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper"
              >
                {step.heldStatus === 'pending'
                  ? 'Review and approve'
                  : `Held call: ${step.heldStatus ?? 'closed'}`}
              </a>
            )}
          </li>
        )
      )}
    </ol>
  );
}

export function RunView({run}: {run: Run}) {
  const scripted = run.model === 'scripted';
  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{run.message}</h2>
        <span className="text-sm">
          <span className={RUN_STATUS_CLASS[run.status]}>
            {RUN_STATUS[run.status]}
          </span>
          <span className="text-faint">
            {' '}
            · {scripted ? 'scripted agent' : run.model}
            {!scripted && ` · ${formatUsd(run.costUsd)}`}
          </span>
        </span>
      </div>
      <Steps runId={run.id} />
      {run.finalText && (scripted || run.status !== 'done') && (
        <p className="text-sm text-muted">{run.finalText}</p>
      )}
    </section>
  );
}
