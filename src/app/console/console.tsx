'use client';

import {useAction, useConvexAuth, useQuery} from 'convex/react';
import {useState, type FormEvent} from 'react';
import {api} from '../../../convex/_generated/api';
import {useSessionToken} from '@/components/convex-provider';

const EXAMPLES = [
  'List my projects and their status.',
  'Summarise the Q3 planning notes.',
  'Read the vendor onboarding checklist and do what it says.',
  'The Acme rebrand is finished. Delete the project.'
];

const VERDICT_STYLE: Record<string, string> = {
  allow: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  step_up: 'bg-amber-50 text-amber-800 border-amber-200',
  deny: 'bg-red-50 text-red-800 border-red-200'
};

const RUN_STATUS: Record<string, string> = {
  running: 'Running',
  done: 'Done',
  held: 'Waiting for your approval',
  refused: 'Refused by the guard',
  failed: 'Failed'
};

function Signal({label, value}: {label: string; value: number}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 text-neutral-500">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
        <span
          className="block h-full rounded-full bg-neutral-800"
          style={{width: `${Math.round(value * 100)}%`}}
        />
      </span>
      <span className="w-10 text-right font-mono">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function Steps({runId}: {runId: string}) {
  const steps = useQuery(api.runs.steps, {runId});
  if (steps === undefined)
    return <p className="text-sm text-neutral-500">Loading…</p>;
  if (steps === null) return null;
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step) =>
        step.kind === 'assistant' ? (
          <li key={step.id} className="text-sm leading-relaxed">
            {step.text}
          </li>
        ) : (
          <li
            key={step.id}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{step.tool}</span>
              {step.decision && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${VERDICT_STYLE[step.decision.verdict] ?? ''}`}
                >
                  {step.decision.verdict} · {step.decision.reasonCode}
                </span>
              )}
              {step.decision?.intentSource === 'verified' && (
                <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-600">
                  intent verified
                </span>
              )}
              {!step.decision && step.code && (
                <span className="text-xs text-neutral-500">{step.code}</span>
              )}
            </div>
            {step.decision?.jev && (
              <div className="flex flex-col gap-1">
                <Signal
                  label="Matches the request"
                  value={step.decision.jev.matchesIntent}
                />
                <Signal
                  label="Destructive"
                  value={step.decision.jev.destructive}
                />
                <Signal
                  label="Follows injected text"
                  value={step.decision.jev.injected}
                />
                <Signal
                  label="Sends data out"
                  value={step.decision.jev.exfiltration}
                />
                <p className="text-xs text-neutral-500">
                  Jev {step.decision.jev.ms} ms · $
                  {step.decision.jev.costUsd?.toFixed(6) ?? '—'}
                </p>
              </div>
            )}
            {step.approvalUrl && (
              <a
                href={step.approvalUrl}
                className="w-fit rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
              >
                {step.heldStatus === 'pending'
                  ? 'Review and approve'
                  : `Held call: ${step.heldStatus}`}
              </a>
            )}
          </li>
        )
      )}
    </ol>
  );
}

export function Console() {
  const {isAuthenticated} = useConvexAuth();
  const {refresh} = useSessionToken();
  const runs = useQuery(api.runs.mine, isAuthenticated ? {} : 'skip');
  const start = useAction(api.agent.run.start);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const latest = runs?.[0];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setSending(true);
    const text = message;
    setMessage('');
    try {
      const accessToken = await refresh();
      if (!accessToken) throw new Error('Sign in again to run the agent.');
      await start({message: text, accessToken});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The run failed to start.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="message" className="text-sm font-medium">
          Ask the agent
        </label>
        <div className="flex gap-2">
          <input
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            placeholder="What should the agent do in the workspace?"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={sending || !isAuthenticated}
            className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {sending ? 'Running…' : 'Run'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setMessage(example)}
              className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
            >
              {example}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>

      {latest && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{latest.message}</h2>
            <span className="text-sm text-neutral-500">
              {RUN_STATUS[latest.status]} · {latest.model} · $
              {latest.costUsd.toFixed(4)}
            </span>
          </div>
          <Steps runId={latest.id} />
          {latest.finalText && latest.status !== 'done' && (
            <p className="text-sm text-neutral-700">{latest.finalText}</p>
          )}
        </section>
      )}
    </div>
  );
}
