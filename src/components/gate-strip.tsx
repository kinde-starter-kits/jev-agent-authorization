import type {ReactNode} from 'react';
import type {PublicDecision} from './decision-card';
import {Stamp} from './stamp';
import {percent, reasonLabel} from '@/lib/labels';

function Checkpoint({
  step,
  name,
  question,
  children,
  failed = false
}: {
  step: number;
  name: string;
  question: string;
  children: ReactNode;
  failed?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 ${
        failed ? 'border-deny/50' : 'border-line'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-faint">0{step}</span>
        <span className="font-display text-lg font-extrabold">{name}</span>
      </div>
      <span className="text-xs text-muted">{question}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * The newest call, drawn as it passes the three checkpoints of the gate.
 * Keyed by the decision id, so each new call replays the animation.
 */
export function GateStrip({decision}: {decision: PublicDecision}) {
  const {kinde, jev} = decision;
  const kindeFailed =
    !kinde.permissionGranted ||
    (kinde.flag !== undefined && kinde.flagEnabled !== true);
  const top = jev
    ? [
        {label: 'follows planted text', value: jev.injected},
        {label: 'destructive', value: jev.destructive},
        {label: 'sends data out', value: jev.exfiltration}
      ].sort((a, b) => b.value - a.value)[0]
    : null;

  return (
    <section
      aria-label="The newest call at the gate"
      className="gate-pass flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-muted">
          At the gate now ·{' '}
          <span className="text-ink">{decision.operationId}</span>
        </span>
        <span className="text-xs text-faint">
          {decision.client === 'in_app' ? 'In-app agent' : 'External client'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-stretch">
        <Checkpoint
          step={1}
          name="Kinde"
          question="Who is the agent acting for, and may they?"
          failed={kindeFailed}
        >
          <span
            className={`block font-mono text-xs ${kinde.permissionGranted ? '' : 'text-deny'}`}
          >
            {kinde.permissionGranted ? '✓' : '✕'} {kinde.permission}
          </span>
          {kinde.flag && (
            <span
              className={`block font-mono text-xs ${
                kinde.flagEnabled ? '' : 'text-deny'
              }`}
            >
              {kinde.flagEnabled ? '✓' : '✕'} flag {kinde.flag}
            </span>
          )}
        </Checkpoint>
        <Checkpoint step={2} name="Jev" question="Did the user ask for this?">
          {jev ? (
            <>
              <span className="block font-mono text-xs">
                matches the request{' '}
                <span className={jev.matchesIntent >= 0.8 ? 'text-allow' : ''}>
                  {percent(jev.matchesIntent)}
                </span>
              </span>
              {top && (
                <span className="block font-mono text-xs">
                  {top.label}{' '}
                  <span className={top.value >= 0.8 ? 'text-deny' : ''}>
                    {percent(top.value)}
                  </span>
                </span>
              )}
              <span className="block font-mono text-[11px] text-faint">
                {Math.round(jev.ms)} ms
              </span>
            </>
          ) : (
            <span className="text-xs text-muted">
              {kindeFailed
                ? 'Not asked. Kinde already said no.'
                : 'Not needed for a read.'}
            </span>
          )}
        </Checkpoint>
        <Checkpoint
          step={3}
          name="Policy"
          question="Run it, hold it, or stop it?"
        >
          <span className="text-xs">{reasonLabel(decision.reasonCode)}</span>
        </Checkpoint>
        <div className="flex items-center justify-center px-6 py-3">
          <Stamp
            key={decision.id}
            verdict={decision.verdict}
            size="lg"
            animate
          />
        </div>
      </div>
    </section>
  );
}
