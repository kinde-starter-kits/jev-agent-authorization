import type {FunctionReturnType} from 'convex/server';
import type {api} from '../../convex/_generated/api';
import {
  formatUsd,
  percent,
  reasonLabel,
  STATUS_LABEL,
  VERDICT_CLASS,
  VERDICT_LABEL
} from '@/lib/labels';

export type PublicDecision = FunctionReturnType<typeof api.wall.recent>[number];

const EDGE: Record<PublicDecision['verdict'], string> = {
  allow: 'border-l-allow',
  step_up: 'border-l-stepup',
  deny: 'border-l-deny'
};

const INTENT_LABEL = {
  verified: 'Intent verified',
  claimed: 'Intent claimed by the agent',
  none: 'No stated intent'
} as const;

function Bar({
  label,
  value,
  good = false
}: {
  label: string;
  value: number;
  good?: boolean;
}) {
  const high = value >= 0.8;
  const fill = high ? (good ? 'bg-allow' : 'bg-deny') : 'bg-ink/70';
  const text = high ? (good ? 'text-allow' : 'text-deny') : '';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-36 shrink-0 text-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
        <span
          className={`block h-full rounded-full ${fill}`}
          style={{width: percent(value)}}
        />
      </span>
      <span className={`w-10 text-right font-mono tabular-nums ${text}`}>
        {percent(value)}
      </span>
    </div>
  );
}

function Check({ok, children}: {ok: boolean; children: React.ReactNode}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs ${
        ok ? 'border-line text-ink' : 'border-deny/40 text-deny'
      }`}
    >
      <span aria-hidden="true">{ok ? '✓' : '✕'}</span>
      {children}
    </span>
  );
}

export function DecisionCard({decision}: {decision: PublicDecision}) {
  const {jev, judge, kinde} = decision;
  const args = Object.entries(decision.args);
  const time = new Date(decision.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <article
      className={`ledger-in flex flex-col gap-3 rounded-xl border border-l-4 border-line bg-card p-4 ${EDGE[decision.verdict]}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-semibold">
          {decision.operationId}
        </span>
        <span className="rounded bg-track px-1.5 py-0.5 font-mono text-[11px] text-muted">
          {decision.method}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-faint">
          <span className="rounded-full border border-line px-2 py-0.5 text-muted">
            {decision.client === 'in_app' ? 'In-app agent' : 'External client'}
          </span>
          <time dateTime={new Date(decision.createdAt).toISOString()}>
            {time}
          </time>
        </span>
      </header>

      {args.length > 0 && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
          {args.map(([key, value]) => (
            <div key={key} className="flex gap-1">
              <dt className="text-faint">{key}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">Kinde</span>
        <Check ok={kinde.permissionGranted}>{kinde.permission}</Check>
        {kinde.flag && (
          <Check ok={kinde.flagEnabled === true}>flag {kinde.flag}</Check>
        )}
        {decision.intentSource && (
          <span className="text-xs text-muted">
            {INTENT_LABEL[decision.intentSource]}
          </span>
        )}
      </div>

      {jev && (
        <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-x-6">
          <Bar label="Matches the request" value={jev.matchesIntent} good />
          <Bar label="Destructive" value={jev.destructive} />
          <Bar label="Follows injected text" value={jev.injected} />
          <Bar label="Sends data out" value={jev.exfiltration} />
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${VERDICT_CLASS[decision.verdict]}`}
        >
          {VERDICT_LABEL[decision.verdict]}
        </span>
        <span className="text-sm">{reasonLabel(decision.reasonCode)}</span>
        <span className="text-xs text-faint">
          {STATUS_LABEL[decision.status] ?? decision.status}
        </span>
        <span className="ml-auto font-mono text-xs text-faint tabular-nums">
          guard {Math.round(decision.guardMs)} ms
          {jev &&
            ` · Jev ${Math.round(jev.ms)} ms · ${formatUsd(jev.costUsd ?? 0)}`}
        </span>
      </footer>

      {jev && (
        <details className="group rounded-lg bg-paper px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted select-none group-open:mb-2">
            How sure was Jev?
          </summary>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">Risk (0 to 4)</dt>
            <dd className="font-mono">
              {jev.risk.toFixed(2)} · confidence {percent(jev.riskConfidence)}
            </dd>
            <dt className="text-muted">Jev single verdict</dt>
            <dd className="font-mono">
              {jev.verdictHint} · {percent(jev.verdictHintConfidence)}{' '}
              <span className="font-sans text-faint">
                (recorded, never decides)
              </span>
            </dd>
            {judge && (
              <>
                <dt className="text-muted">LLM judge</dt>
                <dd className="font-mono">
                  {judge.verdict} · {Math.round(judge.ms)} ms ·{' '}
                  {formatUsd(judge.costUsd ?? 0)}
                </dd>
              </>
            )}
            <dt className="text-muted">Rule that fired</dt>
            <dd className="font-mono">{decision.reasonCode}</dd>
            <dt className="text-muted">Policy</dt>
            <dd className="font-mono">{decision.policyVersion}</dd>
            <dt className="text-muted">Model</dt>
            <dd className="font-mono">{jev.model}</dd>
            <dt className="text-muted">Input tokens</dt>
            <dd className="font-mono">{jev.inputTokens}</dd>
          </dl>
        </details>
      )}
    </article>
  );
}
