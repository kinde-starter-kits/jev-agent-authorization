'use client';

import {useAction, useConvexAuth, useQuery} from 'convex/react';
import {useState} from 'react';
import {api} from '../../../convex/_generated/api';
import {useSessionToken} from '@/components/convex-provider';
import {RunView} from '@/components/run-view';
import {VERDICT_CLASS, VERDICT_LABEL} from '@/lib/labels';

export function Playground() {
  const {isAuthenticated} = useConvexAuth();
  const {refresh} = useSessionToken();
  const scenarios = useQuery(api.agent.playground.scenarios, {});
  const runs = useQuery(api.runs.mine, isAuthenticated ? {} : 'skip');
  const runScenario = useAction(api.agent.playground.run);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latest = runs?.find((run) => run.model === 'scripted');

  async function run(scenarioId: string) {
    setError(null);
    setRunning(scenarioId);
    try {
      const accessToken = await refresh();
      if (!accessToken) throw new Error('Sign in again to run a scenario.');
      await runScenario({scenarioId, accessToken});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The scenario did not start.'
      );
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {scenarios === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-44 animate-pulse rounded-xl bg-track" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {scenarios.map((scenario) => (
            <li
              key={scenario.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold">{scenario.title}</h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${VERDICT_CLASS[scenario.expected]}`}
                  title="The verdict a correct guard gives"
                >
                  Expect: {VERDICT_LABEL[scenario.expected]}
                </span>
              </div>
              <p className="text-sm text-muted">{scenario.attack}</p>
              <p className="rounded-lg bg-paper px-3 py-2 text-sm">
                <span className="text-faint">User asks: </span>
                {scenario.userRequest}
              </p>
              <button
                type="button"
                onClick={() => run(scenario.id)}
                disabled={running !== null || !isAuthenticated}
                className="mt-auto w-fit rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper disabled:opacity-50"
              >
                {running === scenario.id ? 'Running…' : 'Run scenario'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-deny">
          {error}
        </p>
      )}

      {latest && <RunView run={latest} />}
    </div>
  );
}
