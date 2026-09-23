'use client';

import {useAction, useConvexAuth, useQuery} from 'convex/react';
import {useState} from 'react';
import {api} from '../../../convex/_generated/api';
import {SCENARIOS} from '../../../convex/agent/scenarios';
import {useSessionToken} from '@/components/convex-provider';
import {SessionNotice} from '@/components/session-notice';
import {Spinner} from '@/components/spinner';
import {isSessionError, userMessage} from '@/lib/errors';
import {RunView} from '@/components/run-view';
import {VERDICT_CLASS, VERDICT_LABEL} from '@/lib/labels';

export function Playground() {
  const {isAuthenticated} = useConvexAuth();
  const {refresh} = useSessionToken();
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
      // No token: the session notice asks the user to sign in again.
      if (!accessToken) return;
      await runScenario({scenarioId, accessToken});
    } catch (err) {
      if (isSessionError(err)) await refresh();
      setError(userMessage(err, 'The scenario did not start.'));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SessionNotice returnTo="/playground" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {SCENARIOS.map((scenario) => (
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
              {running === scenario.id ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner />
                  Running
                </span>
              ) : (
                'Run scenario'
              )}
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-deny">
          {error}
        </p>
      )}

      {latest && <RunView run={latest} />}
    </div>
  );
}
