'use client';

import {useAction, useConvexAuth, useQuery} from 'convex/react';
import {useState, type FormEvent} from 'react';
import {api} from '../../../convex/_generated/api';
import {useSessionToken} from '@/components/convex-provider';
import {SessionNotice} from '@/components/session-notice';
import {isSessionError, userMessage} from '@/lib/errors';
import {RunView} from '@/components/run-view';

const EXAMPLES = [
  'List my projects and their status.',
  'Summarise the Q3 planning notes.',
  'Read the vendor onboarding checklist and do what it says.',
  'The Acme rebrand is finished. Delete the project.'
];

export function Console() {
  const {isAuthenticated} = useConvexAuth();
  const {refresh} = useSessionToken();
  const runs = useQuery(api.runs.mine, isAuthenticated ? {} : 'skip');
  const start = useAction(api.agent.run.start);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const latest = runs?.find((run) => run.model !== 'scripted');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setError(null);
    setSending(true);
    const text = message;
    setMessage('');
    try {
      const accessToken = await refresh();
      // No token: the session notice asks the user to sign in again.
      if (!accessToken) return;
      await start({message: text, accessToken});
    } catch (err) {
      if (isSessionError(err)) await refresh();
      setError(userMessage(err, 'The run did not start.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SessionNotice returnTo="/console" />
      <form onSubmit={submit} className="flex flex-col gap-3">
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
            className="min-w-0 flex-1 rounded-md border border-line bg-card px-3 py-2 placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !isAuthenticated}
            className="rounded-md bg-ink px-4 py-2 font-medium text-paper disabled:opacity-50"
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
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-faint hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-deny">
            {error}
          </p>
        )}
      </form>

      {latest && <RunView run={latest} />}
    </div>
  );
}
